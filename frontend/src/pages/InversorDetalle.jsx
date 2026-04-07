import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { inversoresApi, peticionesApi } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

const TIPOS = ['piso', 'local', 'nave', 'edificio', 'solar', 'otro'];

const emptyPeticion = {
  tipos_propiedad: [],
  zona: '',
  precio_min: '',
  precio_max: '',
  rentabilidad_min: '',
  necesita_financiacion: false,
  estado: 'activa',
  notas: '',
};

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export default function InversorDetalle() {
  const { id } = useParams();
  const [inversor, setInversor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPeticion);

  const load = () => {
    setLoading(true);
    inversoresApi.getById(id)
      .then(setInversor)
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const openCreate = () => { setEditing(null); setForm(emptyPeticion); setModal(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      tipos_propiedad: p.tipos_propiedad || [],
      zona: p.zona || '',
      precio_min: p.precio_min || '',
      precio_max: p.precio_max || '',
      rentabilidad_min: p.rentabilidad_min || '',
      necesita_financiacion: p.necesita_financiacion || false,
      estado: p.estado || 'activa',
      notas: p.notas || '',
    });
    setModal(true);
  };

  const toggleTipo = (tipo) => {
    setForm(f => ({
      ...f,
      tipos_propiedad: f.tipos_propiedad.includes(tipo)
        ? f.tipos_propiedad.filter(t => t !== tipo)
        : [...f.tipos_propiedad, tipo],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      inversor_id: id,
      precio_min: form.precio_min ? Number(form.precio_min) : null,
      precio_max: form.precio_max ? Number(form.precio_max) : null,
      rentabilidad_min: form.rentabilidad_min ? Number(form.rentabilidad_min) : null,
    };
    if (editing) await peticionesApi.update(editing.id, payload);
    else await peticionesApi.create(payload);
    setModal(false);
    load();
  };

  const handleDelete = async (petId) => {
    if (!confirm('¿Eliminar esta petición?')) return;
    await peticionesApi.delete(petId);
    load();
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  if (loading) return <p className="text-gray-400">Cargando...</p>;
  if (!inversor) return <p className="text-red-500">Inversor no encontrado</p>;

  return (
    <div>
      <Link to="/inversores" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={14} /> Inversores
      </Link>

      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {[inversor.nombre, inversor.apellidos].filter(Boolean).join(' ')}
            </h1>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
              {inversor.email && <span>{inversor.email}</span>}
              {inversor.telefono && <span>{inversor.telefono}</span>}
              {inversor.empresa && <span className="font-medium">{inversor.empresa}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {inversor.presupuesto && (
                <span className="text-gray-600"><span className="text-gray-400">Presupuesto:</span> {fmt(inversor.presupuesto)}</span>
              )}
              {(inversor.valor_propiedad_min || inversor.valor_propiedad_max) && (
                <span className="text-gray-600">
                  <span className="text-gray-400">Valor buscado:</span>{' '}
                  {fmt(inversor.valor_propiedad_min)} – {fmt(inversor.valor_propiedad_max)}
                </span>
              )}
              {inversor.necesita_financiacion && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Necesita financiación</span>
              )}
            </div>
            {inversor.notas && <p className="mt-3 text-sm text-gray-500 max-w-xl">{inversor.notas}</p>}
          </div>
        </div>
      </div>

      {/* Peticiones */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Peticiones de búsqueda</h2>
          <button onClick={openCreate} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            + Nueva petición
          </button>
        </div>

        {inversor.peticiones?.length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">Sin peticiones todavía</p>
        ) : (
          <div className="divide-y">
            {inversor.peticiones?.map(p => (
              <div key={p.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge value={p.estado} />
                      {p.tipos_propiedad?.map(t => (
                        <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{t}</span>
                      ))}
                      {p.necesita_financiacion && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Con financiación</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      {p.zona && <span><span className="text-gray-400">Zona:</span> {p.zona}</span>}
                      {(p.precio_min || p.precio_max) && (
                        <span><span className="text-gray-400">Precio:</span> {fmt(p.precio_min)} – {fmt(p.precio_max)}</span>
                      )}
                      {p.rentabilidad_min && (
                        <span><span className="text-gray-400">Rent. min:</span> {p.rentabilidad_min}%</span>
                      )}
                    </div>
                    {p.notas && <p className="text-xs text-gray-400">{p.notas}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0 text-sm">
                    <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-gray-700">Editar</button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600">Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal petición */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar petición' : 'Nueva petición'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipos de propiedad</label>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map(t => (
                <label key={t} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${
                  form.tipos_propiedad.includes(t) ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" className="hidden" checked={form.tipos_propiedad.includes(t)} onChange={() => toggleTipo(t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zona / Ubicación</label>
            <input value={form.zona} onChange={set('zona')} placeholder="Ej: Madrid, Chamberí, Valencia..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio mínimo (€)</label>
              <input type="number" value={form.precio_min} onChange={set('precio_min')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio máximo (€)</label>
              <input type="number" value={form.precio_max} onChange={set('precio_max')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rentabilidad mínima (%)</label>
              <input type="number" step="0.1" value={form.rentabilidad_min} onChange={set('rentabilidad_min')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select value={form.estado} onChange={set('estado')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="activa">Activa</option>
                <option value="pausada">Pausada</option>
                <option value="cerrada">Cerrada</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.necesita_financiacion}
              onChange={e => setForm(f => ({ ...f, necesita_financiacion: e.target.checked }))} />
            <span className="text-sm text-gray-700">Necesita financiación</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea rows={2} value={form.notas} onChange={set('notas')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {editing ? 'Guardar cambios' : 'Crear petición'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
