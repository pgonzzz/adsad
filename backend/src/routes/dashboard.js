import express from 'express';
import supabase from '../db/supabase.js';

const router = express.Router();

router.get('/stats', async (req, res) => {
  const [
    { count: inversores },
    { count: peticionesActivas },
    { count: propDisponibles },
    { count: matchesNuevos },
    { count: operacionesEnCurso },
    { data: operacionesFirmadas },
  ] = await Promise.all([
    supabase.from('inversores').select('*', { count: 'exact', head: true }),
    supabase.from('peticiones').select('*', { count: 'exact', head: true }).eq('estado', 'activa'),
    supabase.from('propiedades').select('*', { count: 'exact', head: true }).eq('estado', 'disponible'),
    supabase.from('matches').select('*', { count: 'exact', head: true }).eq('estado', 'sugerido'),
    supabase.from('operaciones').select('*', { count: 'exact', head: true }).eq('estado', 'en_curso'),
    supabase.from('operaciones').select('precio_final, comision').eq('estado', 'firmada'),
  ]);

  const volumenCerrado = (operacionesFirmadas || []).reduce((sum, op) => sum + (op.precio_final || 0), 0);
  const comisionesTotales = (operacionesFirmadas || []).reduce((sum, op) => sum + (op.comision || 0), 0);

  res.json({
    inversores,
    peticionesActivas,
    propDisponibles,
    matchesNuevos,
    operacionesEnCurso,
    volumenCerrado,
    comisionesTotales,
  });
});

export default router;
