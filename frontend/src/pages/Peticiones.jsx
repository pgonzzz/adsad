import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { peticionesApi, inversoresApi } from '../api';
import Badge from '../components/Badge';
import Combobox, { ComboboxMunicipios } from '../components/Combobox';
import { PROVINCIAS } from '../data/municipios';
import { SlidersHorizontal, X, List, Columns } from 'lucide-react';

function fmt(n) {
  if (!n) return null;
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

const TIPOS = ['piso', 'local', 'nave', 'edificio', 'solar', 'otro'];

const PIPELINE = [
  { value: 'en_busca',     label: 'En busca',              bg: 'bg-blue-50',    border: 'border-blue-200',   tag: 'bg-blue-100 text-blue-700' },
  { value: 'reservada',    label: 'Propiedad reservada',   bg: 'bg-purple-50',  border: 'border-purple-200', tag: 'bg-purple-100 text-purple-700' },
  { value: 'financiacion', label: 'Pdte. financiación',    bg: 'bg-amber-50',   border: 'border-amber-200',  tag: 'bg-amber-100 text-amber-700' },
  { value: 'tramites',     label: 'En trámites',           bg: 'bg-orange-50',  border: 'border-orange-200', tag: 'bg-orange-100 text-orange-700' },
  { value: 'comprado',     label: 'Comprado',              bg: 'bg-green-50',   border: 'border-green-200',  tag: 'bg-green-100 text-green-700' },
  { value: 'pospuesto',    label: 'Pospuesto',             bg: 'bg-gray-50',    border: 'border-gray-200',   tag: 'bg-gray-100 text-gray-500' },
  { value: 'descartado',   label: 'Descartado',            bg: 'bg-red-50',     border: 'border-red-200',    tag: 'bg-red-100 text-red-700' },
];

const emptyFilters = {
  search: '', provincia: '', poblacion: '', tipos: [],
  precioMin: '', precioMax: '', rentabilidadMin: '', financiacion: '', estado: '',
};

// ── Tarjeta Kanban ──────────────────────────────────────────────────────────
function KanbanCard({ peticion, onDragStart }) {
  const inv = peticion.inversores;
  const nombre = inv ? [inv.nombre, inv.apellidos].filter(Boolean).join(' ') : '—';

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, peticion)}
      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow select-none"
    >
      {/* Nombre inversor */}
      <Link
        to={inv ? `/inversores/${inv.id}` : '#'}
        className="font-semibold text-sm text-blue-600 hover:underline block mb-1"
        onClick={e => e.stopPropagation()}
      >
        {nombre}
      </Link>

      {/* Ubicación */}
      {(peticion.provincia || peticion.poblacion) && (
        <p className="text-xs text-gray-500 mb-2">
          📍 {[peticion.poblacion, peticion.provincia].filter(Boolean).join(', ')}
        </p>
      )}

      {/* Tipos */}
      {peticion.tipos_propiedad?.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {peticion.tipos_propiedad.map(t => (
            <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t}</span>
          ))}
        </div>
      )}

      {/* Precio */}
      {(peticion.precio_min || peticion.precio_max) && (
        <p className="text-xs text-gray-600 mb-1">
          💶 {fmt(peticion.precio_min)} – {fmt(peticion.precio_max)}
        </p>
      )}

      {/* Rentabilidad */}
      {peticion.rentabilidad_min && (
        <p className="text-xs text-gray-600 mb-1">📈 Rent. mín: {peticion.rentabilidad_min}%</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        <Badge value={peticion.estado} />
        {peticion.necesita_financiacion && (
          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Financiación</span>
        )}
      </div>
    </div>
  );
}

// ── Columna Kanban ──────────────────────────────────────────────────────────
function KanbanColumn({ stage, cards, onDragStart, onDrop }) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={`flex flex-col rounded-xl border-2 transition-colors min-h-[200px] ${over ? 'border-blue-400 bg-blue-50' : `${stage.border} ${stage.bg}`}`}
      style={{ minWidth: 240, width: 240 }}
      onDragOver={e => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { setOver(false); onDrop(e, stage.value); }}
    >
      {/* Header columna */}
      <div className="px-3 py-3 flex items-center justify-between border-b border-inherit">
        <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stage.tag}`}>{cards.length}</span>
      </div>

      {/* Tarjetas */}
      <div className="flex flex-col gap-2 p-3 flex-1">
        {cards.map(p => (
          <KanbanCard key={p.id} peticion={p} onDragStart={onDragStart} />
        ))}
        {cards.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-gray-400">Sin peticiones</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export default function Peticiones() {
  const [peticiones, setPeticiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban'); // 'kanban' | 'lista'
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);
  const dragItem = useRef(null);

  const load = () => {
    setLoading(true);
    peticionesApi.getAll()
      .then(setPeticiones)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const toggleTipo = (tipo) => {
    setFilters(f => ({
      ...f,
      tipos: f.tipos.includes(tipo) ? f.tipos.filter(t => t !== tipo) : [...f.tipos, tipo],
    }));
  };

  const resetFilters = () => setFilters(emptyFilters);

  const activeCount = [
    filters.provincia, filters.poblacion, filters.estado, filters.financiacion,
    filters.rentabilidadMin, filters.precioMin, filters.precioMax,
  ].filter(Boolean).length + filters.tipos.length + (filters.search ? 1 : 0);

  const filtered = peticiones.filter(p => {
    const inversorNombre = [p.inversores?.nombre, p.inversores?.apellidos].filter(Boolean).join(' ').toLowerCase();
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!inversorNombre.includes(q) && !(p.provincia || '').toLowerCase().includes(q) && !(p.poblacion || '').toLowerCase().includes(q)) return false;
    }
    if (filters.provincia && p.provincia !== filters.provincia) return false;
    if (filters.poblacion && !(p.poblacion || '').toLowerCase().includes(filters.poblacion.toLowerCase())) return false;
    if (filters.tipos.length > 0 && !filters.tipos.some(t => p.tipos_propiedad?.includes(t))) return false;
    if (filters.precioMin && (p.precio_max || Infinity) < Number(filters.precioMin)) return false;
    if (filters.precioMax && (p.precio_min || 0) > Number(filters.precioMax)) return false;
    if (filters.rentabilidadMin && (p.rentabilidad_min || 0) < Number(filters.rentabilidadMin)) return false;
    if (filters.financiacion === 'si' && !p.necesita_financiacion) return false;
    if (filters.financiacion === 'no' && p.necesita_financiacion) return false;
    if (filters.estado && p.estado !== filters.estado) return false;
    return true;
  });

  // ── Drag & Drop ──
  const handleDragStart = (e, peticion) => {
    dragItem.current = peticion;
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, newPipeline) => {
    e.preventDefault();
    const peticion = dragItem.current;
    if (!peticion || !peticion.inversores?.id) return;
    if (peticion.inversores.pipeline === newPipeline) return;

    // Actualiza optimistamente en UI
    setPeticiones(prev => prev.map(p =>
      p.id === peticion.id
        ? { ...p, inversores: { ...p.inversores, pipeline: newPipeline } }
        : p
    ));

    // Actualiza en backend
    await inversoresApi.update(peticion.inversores.id, { pipeline: newPipeline });
    dragItem.current = null;
  };

  // Agrupa peticiones por pipeline del inversor
  const byPipeline = (stage) =>
    filtered.filter(p => (p.inversores?.pipeline || 'en_busca') === stage);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Peticiones</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} petición{filtered.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Toggle vista */}
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('kanban')}
              className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${view === 'kanban' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <Columns size={14} /> Kanban
            </button>
            <button
              onClick={() => setView('lista')}
              className={`px-3 py-2 flex items-center gap-1.5 text-sm transition-colors ${view === 'lista' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <List size={14} /> Lista
            </button>
          </div>
        </div>
      </div>

      {/* Barra de filtros */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4">
        <div className="p-3 flex gap-3">
          <input
            type="text"
            placeholder="Buscar por inversor, provincia o población..."
            value={filters.search}
            onChange={e => setF('search', e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${showFilters || activeCount > 0 ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            <SlidersHorizontal size={15} />
            Filtros
            {activeCount > 0 && (
              <span className="bg-white text-blue-600 rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold">{activeCount}</span>
            )}
          </button>
          {activeCount > 0 && (
            <button onClick={resetFilters} className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-gray-700">
              <X size={14} /> Limpiar
            </button>
          )}
        </div>

        {showFilters && (
          <div className="px-3 pb-3 border-t pt-3 bg-gray-50 rounded-b-xl grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Provincia</label>
              <Combobox options={PROVINCIAS} value={filters.provincia} onChange={v => setFilters(f => ({ ...f, provincia: v, poblacion: '' }))} placeholder="Todas" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Población</label>
              <ComboboxMunicipios provincia={filters.provincia} value={filters.poblacion} onChange={v => setF('poblacion', v)} placeholder={filters.provincia ? 'Buscar...' : 'Selecciona provincia'} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Estado petición</label>
              <select value={filters.estado} onChange={e => setF('estado', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos</option>
                <option value="activa">Activa</option>
                <option value="pausada">Pausada</option>
                <option value="cerrada">Cerrada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Financiación</label>
              <select value={filters.financiacion} onChange={e => setF('financiacion', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todas</option>
                <option value="si">Necesita financiación</option>
                <option value="no">Sin financiación</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Rango precio (€)</label>
              <div className="flex items-center gap-2">
                <input type="number" placeholder="Mín" value={filters.precioMin} onChange={e => setF('precioMin', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <span className="text-gray-400 shrink-0">–</span>
                <input type="number" placeholder="Máx" value={filters.precioMax} onChange={e => setF('precioMax', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Rentabilidad mínima (%)</label>
              <input type="number" step="0.1" placeholder="Ej: 5" value={filters.rentabilidadMin} onChange={e => setF('rentabilidadMin', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Tipos de propiedad</label>
              <div className="flex flex-wrap gap-2">
                {TIPOS.map(t => (
                  <button key={t} type="button" onClick={() => toggleTipo(t)}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${filters.tipos.includes(t) ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : view === 'kanban' ? (
        // ── Vista Kanban ──
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 400 }}>
          {PIPELINE.map(stage => (
            <KanbanColumn
              key={stage.value}
              stage={stage}
              cards={byPipeline(stage.value)}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
            />
          ))}
        </div>
      ) : (
        // ── Vista Lista ──
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Inversor</th>
                <th className="px-4 py-3">Pipeline</th>
                <th className="px-4 py-3">Provincia</th>
                <th className="px-4 py-3">Población</th>
                <th className="px-4 py-3">Tipos</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Rent. mín.</th>
                <th className="px-4 py-3">Financiación</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">No hay peticiones con esos filtros</td></tr>
              ) : filtered.map(p => {
                const stage = PIPELINE.find(s => s.value === (p.inversores?.pipeline || 'en_busca'));
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {p.inversores ? (
                        <Link to={`/inversores/${p.inversores.id}`} className="text-blue-600 hover:underline">
                          {[p.inversores.nombre, p.inversores.apellidos].filter(Boolean).join(' ')}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {stage && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stage.tag}`}>{stage.label}</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.provincia || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{p.poblacion || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.tipos_propiedad?.length > 0 ? p.tipos_propiedad.map(t => (
                          <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t}</span>
                        )) : <span className="text-gray-400">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {(p.precio_min || p.precio_max) ? <>{fmt(p.precio_min)} – {fmt(p.precio_max)}</> : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{p.rentabilidad_min ? `${p.rentabilidad_min}%` : '—'}</td>
                    <td className="px-4 py-3">
                      {p.necesita_financiacion
                        ? <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Sí</span>
                        : <span className="text-gray-400 text-xs">No</span>}
                    </td>
                    <td className="px-4 py-3"><Badge value={p.estado} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
