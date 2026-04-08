import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Bell, MessageSquare, Check } from 'lucide-react';
import { useNotificaciones } from '../hooks/useNotificaciones';

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora mismo';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs / 24)}d`;
}

export default function NotificacionesBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const { notifs, noLeidas, leidas, marcarLeida, marcarTodasLeidas } = useNotificaciones();

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
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
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Notificaciones</span>
            {noLeidas > 0 && (
              <button
                onClick={marcarTodasLeidas}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <Check size={11} /> Marcar todas leídas
              </button>
            )}
          </div>

          {/* Lista */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifs.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">
                Sin notificaciones
              </div>
            ) : notifs.map(n => {
              const leida = leidas.has(n.id);
              return (
                <Link
                  key={n.id}
                  to={n.link || '/'}
                  onClick={() => { marcarLeida(n.id); setOpen(false); }}
                  className={`flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${leida ? 'opacity-60' : ''}`}
                >
                  <div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${leida ? 'bg-gray-100' : 'bg-green-100'}`}>
                    <MessageSquare size={13} className={leida ? 'text-gray-400' : 'text-green-600'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs font-semibold truncate ${leida ? 'text-gray-500' : 'text-gray-900'}`}>
                        {n.titulo}
                        {!leida && <span className="ml-1.5 inline-block w-1.5 h-1.5 bg-blue-500 rounded-full align-middle" />}
                      </p>
                      <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(n.ts)}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5 leading-snug">{n.cuerpo}</p>
                    {n.subtexto && <p className="text-[10px] text-gray-400 mt-0.5">{n.subtexto}</p>}
                  </div>
                </Link>
              );
            })}
          </div>

          {notifs.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50">
              <Link
                to="/captacion"
                onClick={() => setOpen(false)}
                className="text-xs text-blue-600 hover:underline"
              >
                Ver todos los leads →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
