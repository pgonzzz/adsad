import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { peticionesApi } from '../api';
import Badge from '../components/Badge';
import Combobox, { ComboboxMunicipios } from '../components/Combobox';
import { PROVINCIAS } from '../data/municipios';
import { SlidersHorizontal, X } from 'lucide-react';

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

const TIPOS = ['piso', 'local', 'nave', 'edificio', 'solar', 'otro'];

const emptyFilters = {
  search: '',
  provincia: '',
  poblacion: '',
  tipos: [],
  precioMin: '',
  precioMax: '',
  rentabilidadMin: '',
  financiacion: '',
  estado: '',
};

export default function Peticiones() {
  const [peticiones, setPeticiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(emptyFilters);

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
    filters.provincia, filters.poblacion, filters.estado, filters.financiacion, filters.rentabilidadMin,
    filters.precioMin, filters.precioMax,
  ].filter(Boolean).length + filters.tipos.length + (filters.search ? 1 : 0);

  const filtered = peticiones.filter(p => {
    const inversorNombre = [p.inversores?.nombre, p.inversores?.apellidos].filter(Boolean).join(' ').toLowerCase();

    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (!inversorNombre.includes(q) &&
          !(p.provincia || '').toLowerCase().includes(q) &&
          !(p.poblacion || '').toLowerCase().includes(q)) return false;
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Peticiones</h1>
        <span className="text-sm text-gray-500">{filtered.length} petición{filtered.length !== 1 ? 'es' : ''}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">

        {/* Barra de búsqueda + botón filtros */}
        <div className="p-4 border-b flex gap-3">
          <input
            type="text"
            placeholder="Buscar por inversor, provincia o población..."
            value={filters.search}
            onChange={e => setF('search', e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              showFilters || activeCount > 0
                ? 'bg-blue-600 text-white border-blue-600'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={15} />
            Filtros
            {activeCount > 0 && (
              <span className="bg-white text-blue-600 rounded-full text-xs w-5 h-5 flex items-center justify-center font-bold">
                {activeCount}
              </span>
            )}
          </button>
          {activeCount > 0 && (
            <button onClick={resetFilters} className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-gray-700">
              <X size={14} /> Limpiar
            </button>
          )}
        </div>

        {/* Panel de filtros */}
        {showFilters && (
          <div className="p-4 border-b bg-gray-50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Provincia */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Provincia</label>
              <Combobox
                options={PROVINCIAS}
                value={filters.provincia}
                onChange={v => setFilters(f => ({ ...f, provincia: v, poblacion: '' }))}
                placeholder="Todas las provincias"
              />
            </div>

            {/* Población */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Población</label>
              <ComboboxMunicipios
                provincia={filters.provincia}
                value={filters.poblacion}
                onChange={v => setF('poblacion', v)}
                placeholder={filters.provincia ? 'Buscar población...' : 'Selecciona provincia primero'}
              />
            </div>

            {/* Estado */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Estado</label>
              <select
                value={filters.estado}
                onChange={e => setF('estado', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Todos</option>
                <option value="activa">Activa</option>
                <option value="pausada">Pausada</option>
                <option value="cerrada">Cerrada</option>
              </select>
            </div>

            {/* Financiación */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Financiación</label>
              <select
                value={filters.financiacion}
                onChange={e => setF('financiacion', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Todas</option>
                <option value="si">Necesita financiación</option>
                <option value="no">Sin financiación</option>
              </select>
            </div>

            {/* Rango de precio */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Rango de precio (€)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Mín"
                  value={filters.precioMin}
                  onChange={e => setF('precioMin', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-gray-400 shrink-0">–</span>
                <input
                  type="number"
                  placeholder="Máx"
                  value={filters.precioMax}
                  onChange={e => setF('precioMax', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Rentabilidad mínima */}
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Rentabilidad mínima (%)</label>
              <input
                type="number"
                step="0.1"
                placeholder="Ej: 5"
                value={filters.rentabilidadMin}
                onChange={e => setF('rentabilidadMin', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Tipos de propiedad */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-gray-500 uppercase mb-2">Tipos de propiedad</label>
              <div className="flex flex-wrap gap-2">
                {TIPOS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => toggleTipo(t)}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                      filters.tipos.includes(t)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Inversor</th>
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
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">No hay peticiones con esos filtros</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  {p.inversores ? (
                    <Link to={`/inversores/${p.inversores.id}`} className="text-blue-600 hover:underline">
                      {[p.inversores.nombre, p.inversores.apellidos].filter(Boolean).join(' ')}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{p.provincia || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{p.poblacion || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {p.tipos_propiedad?.length > 0
                      ? p.tipos_propiedad.map(t => (
                          <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{t}</span>
                        ))
                      : <span className="text-gray-400">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                  {(p.precio_min || p.precio_max) ? <>{fmt(p.precio_min)} – {fmt(p.precio_max)}</> : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {p.rentabilidad_min ? `${p.rentabilidad_min}%` : '—'}
                </td>
                <td className="px-4 py-3">
                  {p.necesita_financiacion
                    ? <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Sí</span>
                    : <span className="text-gray-400 text-xs">No</span>}
                </td>
                <td className="px-4 py-3">
                  <Badge value={p.estado} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
