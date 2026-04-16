import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Clock, MessageSquare } from 'lucide-react';
import { notificacionesApi } from '../api';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

export default function NotificacionesBell() {
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const ref = useRef();
  const navigate = useNavigate();

  const loadNotifs = useCallback(() => {
    notificacionesApi.getAll({ limit: 20 }).then(setNotifs).catch(() => {});
    notificacionesApi.getNoLeidas().then(r => setNoLeidas(r.count || 0)).catch(() => {});
  }, []);

  useEffect(() => {
    loadNotifs();
    const interval = setInterval(loadNotifs, 30000);
    return () => clearInterval(interval);
  }, [loadNotifs]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const marcarLeida = async (n) => {
    if (!n.leida) {
      await notificacionesApi.marcarLeida(n.id).catch(() => {});
      setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, leida: true } : x));
      setNoLeidas(prev => Math.max(0, prev - 1));
    }
    if (n.url) {
      navigate(n.url);
      setOpen(false);
    }
  };

  const marcarTodasLeidas = async () => {
    await notificacionesApi.marcarTodasLeidas().catch(() => {});
    setNotifs(prev => prev.map(x => ({ ...x, leida: true })));
    setNoLeidas(0);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(v => !v); if (!open) loadNotifs(); }}
        className="relative p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        title="Notificaciones"
      >
        <Bell size={18} />
        {noLeidas > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {noLeidas > 9 ? '9+' : noLeidas}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notificaciones</span>
            {noLeidas > 0 && (
              <button onClick={marcarTodasLeidas} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
                <Check size={11} /> Marcar todas leídas
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">Sin notificaciones</div>
            ) : notifs.map(n => (
              <button
                key={n.id}
                onClick={() => marcarLeida(n)}
                className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left ${n.leida ? 'opacity-60' : ''}`}
              >
                <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${n.leida ? 'bg-gray-100' : n.titulo?.startsWith('⏰') ? 'bg-amber-100' : 'bg-green-100'}`}>
                  {n.titulo?.startsWith('⏰') ? (
                    <Clock size={13} className={n.leida ? 'text-gray-400' : 'text-amber-600'} />
                  ) : (
                    <MessageSquare size={13} className={n.leida ? 'text-gray-400' : 'text-green-600'} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs font-semibold truncate ${n.leida ? 'text-gray-500' : 'text-gray-900'}`}>
                      {n.titulo}
                      {!n.leida && <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-blue-500 rounded-full align-middle" />}
                    </p>
                    <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.mensaje && <p className="text-xs text-gray-600 mt-0.5 leading-snug line-clamp-2">{n.mensaje}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
