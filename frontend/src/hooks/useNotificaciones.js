import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const STORAGE_KEY = 'pisalia_notifs_leidas';

function getLeidas() {
  try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveLeidas(set) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

export function useNotificaciones() {
  const [notifs, setNotifs] = useState([]);
  const [leidas, setLeidasState] = useState(getLeidas);

  // Carga inicial: leads respondidos de las últimas 48h
  const cargarNotifs = useCallback(async () => {
    const hace48h = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from('captacion_leads')
      .select('id, nombre_vendedor, telefono, poblacion, tipo, ultimo_contacto, campana_id, captacion_campanas(nombre)')
      .eq('estado', 'respondido')
      .gte('ultimo_contacto', hace48h)
      .order('ultimo_contacto', { ascending: false });

    if (data) {
      setNotifs(data.map(l => ({
        id: `lead-${l.id}`,
        tipo: 'respuesta_wa',
        titulo: 'Lead ha respondido',
        cuerpo: `${l.nombre_vendedor || 'Contacto'} (${l.telefono || '—'}) ha contestado tu mensaje de WhatsApp`,
        subtexto: [l.tipo, l.poblacion, l.captacion_campanas?.nombre].filter(Boolean).join(' · '),
        ts: l.ultimo_contacto,
        link: '/captacion',
      })));
    }
  }, []);

  useEffect(() => {
    cargarNotifs();

    // Supabase Realtime: escuchar cuando un lead cambia a 'respondido'
    const channel = supabase
      .channel('leads-respondidos')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'captacion_leads', filter: 'estado=eq.respondido' },
        (payload) => {
          const l = payload.new;
          setNotifs(prev => {
            const id = `lead-${l.id}`;
            if (prev.find(n => n.id === id)) return prev; // ya existe
            return [{
              id,
              tipo: 'respuesta_wa',
              titulo: 'Lead ha respondido',
              cuerpo: `${l.nombre_vendedor || 'Contacto'} (${l.telefono || '—'}) ha contestado tu mensaje`,
              subtexto: [l.tipo, l.poblacion].filter(Boolean).join(' · '),
              ts: l.ultimo_contacto || new Date().toISOString(),
              link: '/captacion',
            }, ...prev]);
          });
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [cargarNotifs]);

  const noLeidas = notifs.filter(n => !leidas.has(n.id)).length;

  const marcarLeida = useCallback((id) => {
    setLeidasState(prev => {
      const next = new Set(prev);
      next.add(id);
      saveLeidas(next);
      return next;
    });
  }, []);

  const marcarTodasLeidas = useCallback(() => {
    setLeidasState(prev => {
      const next = new Set(prev);
      notifs.forEach(n => next.add(n.id));
      saveLeidas(next);
      return next;
    });
  }, [notifs]);

  return { notifs, noLeidas, leidas, marcarLeida, marcarTodasLeidas };
}
