import express from 'express';
import supabase from '../db/supabase.js';
import { audit } from '../middleware/audit.js';

const router = express.Router();

// GET todos los matches con joins
router.get('/', async (req, res) => {
  let query = supabase
    .from('matches')
    .select(`
      *,
      peticiones (
        id, zona, precio_min, precio_max, tipos_propiedad, rentabilidad_min, necesita_financiacion,
        inversores (id, nombre, email, telefono)
      ),
      propiedades (
        id, tipo, zona, precio, rentabilidad_bruta, rentabilidad_neta, acepta_financiacion, estado, descripcion,
        proveedores (id, nombre, tipo)
      )
    `)
    .order('score', { ascending: false });

  if (req.query.estado) query = query.eq('estado', req.query.estado);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.put('/:id', audit('matches', 'update'), async (req, res) => {
  const { data, error } = await supabase
    .from('matches')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.delete('/:id', audit('matches', 'delete'), async (req, res) => {
  const { error } = await supabase
    .from('matches')
    .delete()
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.status(204).send();
});

// POST /api/matches/generar - Algoritmo de matching
router.post('/generar', audit('matches', 'create'), async (req, res) => {
  const [{ data: peticiones, error: petErr }, { data: propiedades, error: propErr }] = await Promise.all([
    supabase.from('peticiones').select('*').eq('estado', 'activa'),
    supabase.from('propiedades').select('*').eq('estado', 'disponible'),
  ]);

  if (petErr || propErr) return res.status(500).json({ error: 'Error obteniendo datos' });
  if (!peticiones.length || !propiedades.length) {
    return res.json({ creados: 0, total: 0, mensaje: 'No hay peticiones activas o propiedades disponibles' });
  }

  const candidatos = [];

  for (const peticion of peticiones) {
    for (const propiedad of propiedades) {
      let score = 0;

      // Financiación: filtro duro
      if (peticion.necesita_financiacion && !propiedad.acepta_financiacion) continue;

      // Tipo de propiedad (+40)
      if (peticion.tipos_propiedad?.length > 0 && peticion.tipos_propiedad.includes(propiedad.tipo)) {
        score += 40;
      }

      // Zona (+25) - coincidencia parcial de texto
      if (peticion.zona && propiedad.zona) {
        const pZona = peticion.zona.toLowerCase();
        const prZona = propiedad.zona.toLowerCase();
        if (prZona.includes(pZona) || pZona.includes(prZona)) {
          score += 25;
        }
      }

      // Precio dentro del rango (+20)
      if (propiedad.precio !== null) {
        const min = peticion.precio_min ?? 0;
        const max = peticion.precio_max ?? Infinity;
        if (propiedad.precio >= min && propiedad.precio <= max) {
          score += 20;
        }
      }

      // Rentabilidad >= mínimo requerido (+15)
      if (peticion.rentabilidad_min && propiedad.rentabilidad_bruta) {
        if (propiedad.rentabilidad_bruta >= peticion.rentabilidad_min) {
          score += 15;
        }
      }

      // Solo incluir matches con score mínimo
      if (score >= 40) {
        candidatos.push({
          peticion_id: peticion.id,
          propiedad_id: propiedad.id,
          score,
          estado: 'sugerido',
        });
      }
    }
  }

  if (candidatos.length === 0) {
    return res.json({ creados: 0, total: 0, mensaje: 'No se encontraron matches compatibles' });
  }

  const { data, error } = await supabase
    .from('matches')
    .upsert(candidatos, { onConflict: 'peticion_id,propiedad_id', ignoreDuplicates: true })
    .select();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ creados: data.length, total: candidatos.length });
});

export default router;
