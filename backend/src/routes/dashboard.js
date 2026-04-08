import express from 'express';
import supabase from '../db/supabase.js';

const router = express.Router();

router.get('/stats', async (req, res) => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    { count: totalInversores },
    { count: propDisponibles },
    { data: inversoresPipeline },
    { data: propiedadesEstado },
    { data: peticionesPipeline },
    { count: leadsTotal },
    { count: leadsRespondidos },
    { count: leadsConvertidos },
    { count: mensajesHoy },
  ] = await Promise.all([
    supabase.from('inversores').select('*', { count: 'exact', head: true }),
    supabase.from('propiedades').select('*', { count: 'exact', head: true }).eq('estado', 'disponible'),
    supabase.from('inversores').select('pipeline'),
    supabase.from('propiedades').select('estado'),
    supabase.from('inversores').select('pipeline').not('pipeline', 'in', '("pospuesto","descartado")'),
    supabase.from('captacion_leads').select('*', { count: 'exact', head: true }),
    supabase.from('captacion_leads').select('*', { count: 'exact', head: true }).eq('estado', 'respondido'),
    supabase.from('captacion_leads').select('*', { count: 'exact', head: true }).eq('estado', 'convertido'),
    supabase.from('captacion_envios').select('*', { count: 'exact', head: true }).gte('enviado_at', todayStart.toISOString()),
  ]);

  // Inversores agrupados por pipeline
  const PIPELINE_STAGES = ['en_busca', 'reservada', 'financiacion', 'tramites', 'comprado', 'pospuesto', 'descartado'];
  const invPorPipeline = {};
  PIPELINE_STAGES.forEach(s => invPorPipeline[s] = 0);
  (inversoresPipeline || []).forEach(i => {
    if (invPorPipeline[i.pipeline] !== undefined) invPorPipeline[i.pipeline]++;
  });

  // Propiedades agrupadas por estado
  const propPorEstado = { disponible: 0, reservada: 0, en_negociacion: 0, vendida: 0 };
  (propiedadesEstado || []).forEach(p => {
    if (propPorEstado[p.estado] !== undefined) propPorEstado[p.estado]++;
  });

  // Inversores activos (no pospuesto ni descartado)
  const inversoresActivos = (peticionesPipeline || []).length;

  res.json({
    totalInversores,
    inversoresActivos,
    propDisponibles,
    propPorEstado,
    invPorPipeline,
    captacion: {
      total: leadsTotal || 0,
      respondidos: leadsRespondidos || 0,
      convertidos: leadsConvertidos || 0,
      mensajesHoy: mensajesHoy || 0,
    },
  });
});

export default router;
