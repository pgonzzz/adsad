import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { peticionesApi } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

const TIPOS = ['piso', 'local', 'nave', 'edificio', 'solar', 'otro'];

export default function Peticiones() {
  const [peticiones, setPeticiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [filterFinanciacion, setFilterFinanciacion] = useState('');

  const load = () => {
    setLoading(true);
    peticionesApi.getAll()
      .then(setPeticiones)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = peticiones.filter(p => {
    const inversorNombre = [p.inversores?.nombre, p.inversores?.apellidos].filter(Boolean).join(' ').toLowerCase();
    const matchSearch =
      inversorNombre.includes(search.toLowerCase()) ||
      (p.zona || '').toLowerCase().includes(search.toLowerCase());
    const matchEstado = filterEstado ? p.estado === filterEstado : true;
    const matchFinanciacion =
      filterFinanciacion === 'si' ? p.necesita_financiacion :
      filterFinanciacion === 'no' ? !p.necesita_financiacion : true;
    return matchSearch && matchEstado && matchFinanciacion;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Peticiones</h1>
        <span className="text-sm text-gray-500">{filtered.length} petición{filtered.length !== 1 ? 'es' : ''}</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Filtros */}
        <div className="p-4 border-b flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Buscar por inversor o zona..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterEstado}
            onChange={e => setFilterEstado(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="activa">Activa</option>
            <option value="pausada">Pausada</option>
            <option value="cerrada">Cerrada</option>
          </select>
          <select
            value={filterFinanciacion}
            onChange={e => setFilterFinanciacion(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Financiación: todas</option>
            <option value="si">Necesita financiación</option>
            <option value="no">Sin financiación</option>
          </select>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Inversor</th>
              <th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Tipos</th>
              <th className="px-4 py-3">Precio</th>
              <th className="px-4 py-3">Rent. mín.</th>
              <th className="px-4 py-3">Financiación</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400">No hay peticiones</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  {p.inversores ? (
                    <Link to={`/inversores/${p.inversores.id}`} className="text-blue-600 hover:underline">
                      {[p.inversores.nombre, p.inversores.apellidos].filter(Boolean).join(' ')}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{p.zona || '—'}</td>
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
