import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { inversoresApi } from '../api';
import Modal from '../components/Modal';

const PIPELINE = [
  { value: 'en_busca',     label: 'En busca de propiedad',     bg: 'bg-blue-100',   text: 'text-blue-700' },
  { value: 'reservada',    label: 'Propiedad reservada',        bg: 'bg-purple-100', text: 'text-purple-700' },
  { value: 'financiacion', label: 'Pendiente de financiación',  bg: 'bg-amber-100',  text: 'text-amber-700' },
  { value: 'tramites',     label: 'En trámites',                bg: 'bg-orange-100', text: 'text-orange-700' },
  { value: 'comprado',     label: 'Comprado',                   bg: 'bg-green-100',  text: 'text-green-700' },
  { value: 'pospuesto',    label: 'Pospuesto',                  bg: 'bg-gray-100',   text: 'text-gray-500' },
  { value: 'descartado',   label: 'Descartado',                 bg: 'bg-red-100',    text: 'text-red-700' },
];

function PipelineTag({ value }) {
  const stage = PIPELINE.find(p => p.value === value) || PIPELINE[0];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stage.bg} ${stage.text}`}>
      {stage.label}
    </span>
  );
}

const empty = {
  nombre: '', apellidos: '', email: '', telefono: '', empresa: '',
  zona: '', presupuesto: '', valor_propiedad_min: '', valor_propiedad_max: '',
  necesita_financiacion: false, pipeline: 'en_busca', notas: '',
};

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

const fullName = (inv) => [inv.nombre, inv.apellidos].filter(Boolean).join(' ');

export default function Inversores() {
  const [inversores, setInversores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPipeline, setFilterPipeline] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);

  const load = () => {
    setLoading(true);
    inversoresApi.getAll()
      .then(setInversores)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const openCreate = () => { setEditing(null); setForm(empty); setModal(true); };
  const openEdit = (inv) => {
    setEditing(inv);
    setForm({
      nombre: inv.nombre || '',
      apellidos: inv.apellidos || '',
      email: inv.email || '',
      telefono: inv.telefono || '',
      empresa: inv.empresa || '',
      zona: inv.zona || '',
      presupuesto: inv.presupuesto || '',
      valor_propiedad_min: inv.valor_propiedad_min || '',
      valor_propiedad_max: inv.valor_propiedad_max || '',
      necesita_financiacion: inv.necesita_financiacion || false,
      pipeline: inv.pipeline || 'en_busca',
      notas: inv.notas || '',
    });
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      presupuesto: form.presupuesto ? Number(form.presupuesto) : null,
      valor_propiedad_min: form.valor_propiedad_min ? Number(form.valor_propiedad_min) : null,
      valor_propiedad_max: form.valor_propiedad_max ? Number(form.valor_propiedad_max) : null,
    };
    if (editing) await inversoresApi.update(editing.id, payload);
    else await inversoresApi.create(payload);
    setModal(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este inversor y todas sus peticiones?')) return;
    await inversoresApi.delete(id);
    load();
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const filtered = inversores.filter(i => {
    const matchSearch =
      fullName(i).toLowerCase().includes(search.toLowerCase()) ||
      (i.email || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.empresa || '').toLowerCase().includes(search.toLowerCase()) ||
      (i.zona || '').toLowerCase().includes(search.toLowerCase());
    const matchPipeline = filterPipeline ? i.pipeline === filterPipeline : true;
    return matchSearch && matchPipeline;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Inversores</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + Nuevo inversor
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Filtros */}
        <div className="p-4 border-b flex flex-wrap gap-3">
          <input
            type="text" placeholder="Buscar por nombre, email, empresa o zona..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={filterPipeline} onChange={e => setFilterPipeline(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las etapas</option>
            {PIPELINE.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Contacto</th>
              <th className="px-4 py-3">Zona</th>
              <th className="px-4 py-3">Presupuesto</th>
              <th className="px-4 py-3">Valor buscado</th>
              <th className="px-4 py-3">Pipeline</th>
              <th className="px-4 py-3">Peticiones</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-gray-400">No hay inversores</td></tr>
            ) : filtered.map(inv => (
              <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">
                  <Link to={`/inversores/${inv.id}`} className="text-blue-600 hover:underline">{fullName(inv)}</Link>
                  {inv.empresa && <div className="text-xs text-gray-400">{inv.empresa}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <div>{inv.email || '—'}</div>
                  {inv.telefono && <div className="text-xs text-gray-400">{inv.telefono}</div>}
                </td>
                <td className="px-4 py-3 text-gray-600">{inv.zona || '—'}</td>
                <td className="px-4 py-3 text-gray-700 font-medium">{fmt(inv.presupuesto)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {inv.valor_propiedad_min || inv.valor_propiedad_max
                    ? <>{fmt(inv.valor_propiedad_min)} – {fmt(inv.valor_propiedad_max)}</>
                    : '—'}
                </td>
                <td className="px-4 py-3">
                  <PipelineTag value={inv.pipeline} />
                </td>
                <td className="px-4 py-3 text-gray-600">{inv.peticiones?.length ?? 0}</td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => openEdit(inv)} className="text-gray-400 hover:text-gray-700">Editar</button>
                  <button onClick={() => handleDelete(inv.id)} className="text-red-400 hover:text-red-600">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar inversor' : 'Nuevo inversor'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Nombre y Apellidos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input required value={form.nombre} onChange={set('nombre')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos</label>
              <input value={form.apellidos} onChange={set('apellidos')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Email y Teléfono */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={set('email')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
              <input value={form.telefono} onChange={set('telefono')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Empresa y Zona */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
              <input value={form.empresa} onChange={set('empresa')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Zona de búsqueda</label>
              <input value={form.zona} onChange={set('zona')} placeholder="Ej: Madrid, Valencia..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Pipeline */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Etapa del pipeline</label>
            <select value={form.pipeline} onChange={set('pipeline')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PIPELINE.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>

          {/* Presupuesto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto (€)</label>
            <input type="number" value={form.presupuesto} onChange={set('presupuesto')}
              placeholder="Ej: 500000"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Rango de valor de propiedad buscada */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor de propiedad buscada (€)</label>
            <div className="flex items-center gap-2">
              <input type="number" value={form.valor_propiedad_min} onChange={set('valor_propiedad_min')}
                placeholder="Mínimo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <span className="text-gray-400 font-medium shrink-0">–</span>
              <input type="number" value={form.valor_propiedad_max} onChange={set('valor_propiedad_max')}
                placeholder="Máximo"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          {/* Necesita financiación */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.necesita_financiacion}
              onChange={e => setForm(f => ({ ...f, necesita_financiacion: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">¿Necesita financiación?</span>
          </label>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea rows={3} value={form.notas} onChange={set('notas')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {editing ? 'Guardar cambios' : 'Crear inversor'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
