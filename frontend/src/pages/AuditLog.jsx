import { useState, useEffect } from 'react';
import { activityLogApi } from '../api';
import {
  Clock, User2, Plus, Pencil, Trash2, RefreshCw, ChevronLeft, ChevronRight,
} from 'lucide-react';

const ACCION_ICON = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
};

const ACCION_COLOR = {
  create: 'bg-green-100 text-green-600',
  update: 'bg-blue-100 text-blue-600',
  delete: 'bg-red-100 text-red-600',
};

const ACCION_LABEL = {
  create: 'Creó',
  update: 'Actualizó',
  delete: 'Eliminó',
};

const ENTIDAD_LABEL = {
  inversores: 'Inversor',
  propiedades: 'Propiedad',
  peticiones: 'Petición',
  proveedores: 'Proveedor',
  matches: 'Match',
  operaciones: 'Operación',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
}

function fmtTimeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `hace ${days}d`;
}

const PAGE_SIZE = 30;

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filterEntidad, setFilterEntidad] = useState('');

  const loadPage = (pg = page) => {
    setLoading(true);
    const params = { limit: PAGE_SIZE, offset: pg * PAGE_SIZE };
    if (filterEntidad) params.entidad = filterEntidad;
    activityLogApi.getAll(params).then(setEntries).finally(() => setLoading(false));
  };

  useEffect(() => { loadPage(0); setPage(0); }, [filterEntidad]);
  useEffect(() => { loadPage(); }, [page]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Registro de actividad</h1>
        <div className="flex items-center gap-3">
          <select
            value={filterEntidad}
            onChange={(e) => setFilterEntidad(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las entidades</option>
            {Object.entries(ENTIDAD_LABEL).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => loadPage()}
            className="p-2 text-gray-400 hover:text-gray-600"
            title="Refrescar"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Cargando…</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Sin registros de actividad todavía.
          <br />
          <span className="text-xs">Los cambios en inversores, propiedades, peticiones, etc. aparecerán aquí.</span>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {entries.map((e) => {
            const Icon = ACCION_ICON[e.accion] || Pencil;
            const color = ACCION_COLOR[e.accion] || 'bg-gray-100 text-gray-600';
            const campos = e.cambios ? Object.keys(e.cambios) : [];
            return (
              <div key={e.id} className="px-5 py-3.5 flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {e.resumen}
                    </span>
                    <span className="text-[10px] uppercase font-medium text-gray-400 tracking-wide">
                      {ENTIDAD_LABEL[e.entidad] || e.entidad}
                    </span>
                  </div>
                  {campos.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Campos: {campos.join(', ')}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <User2 size={10} />
                      {e.user_email || 'Sistema'}
                    </span>
                    <span className="flex items-center gap-1" title={fmtDate(e.created_at)}>
                      <Clock size={10} />
                      {fmtTimeAgo(e.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paginación */}
      {!loading && entries.length > 0 && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            <ChevronLeft size={14} /> Anterior
          </button>
          <span>Página {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={entries.length < PAGE_SIZE}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Siguiente <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
