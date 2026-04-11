import { useState, useEffect } from 'react';
import { operacionesApi } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES');
}

export default function Operaciones() {
  const [ops, setOps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ estado: 'en_curso', precio_final: '', comision: '', fecha_firma: '', notas: '' });

  const load = () => {
    setLoading(true);
    const params = filtroEstado ? { estado: filtroEstado } : {};
    operacionesApi.getAll(params)
      .then(setOps)
      .finally(() => setLoading(false));
  };

  useEffect(load, [filtroEstado]);

  const openEdit = (op) => {
    setEditing(op);
    setForm({
      estado: op.estado,
      precio_final: op.precio_final || '',
      comision: op.comision || '',
      fecha_firma: op.fecha_firma || '',
      notas: op.notas || '',
    });
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      precio_final: form.precio_final ? Number(form.precio_final) : null,
      comision: form.comision ? Number(form.comision) : null,
      fecha_firma: form.fecha_firma || null,
    };
    await operacionesApi.update(editing.id, payload);
    setModal(false);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta operación?')) return;
    await operacionesApi.delete(id);
    load();
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const firmadas = ops.filter(o => o.estado === 'firmada');
  const volumen = firmadas.reduce((s, o) => s + (o.precio_final || 0), 0);
  const comisiones = firmadas.reduce((s, o) => s + (o.comision || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Operaciones</h1>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
        {[
          { label: 'En curso', value: ops.filter(o => o.estado === 'en_curso').length },
          { label: 'Volumen cerrado', value: fmt(volumen) },
          { label: 'Comisiones generadas', value: fmt(comisiones) },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <p className="text-xl font-bold text-gray-900">{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b">
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los estados</option>
            <option value="en_curso">En curso</option>
            <option value="firmada">Firmada</option>
            <option value="caida">Caída</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[800px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Inversor</th>
                <th className="px-4 py-3">Propiedad</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Precio final</th>
                <th className="px-4 py-3">Comisión</th>
                <th className="px-4 py-3">Fecha firma</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              ) : ops.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">
                  No hay operaciones. Crea una desde la página de Matches cuando un match esté en estado "Negociando".
                </td></tr>
              ) : ops.map(op => {
                const inv = op.matches?.peticiones?.inversores;
                const prop = op.matches?.propiedades;
                return (
                  <tr key={op.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{inv?.nombre || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {prop ? `${prop.tipo} · ${prop.zona || '—'}` : '—'}
                    </td>
                    <td className="px-4 py-3"><Badge value={op.estado} /></td>
                    <td className="px-4 py-3 font-medium text-gray-900">{fmt(op.precio_final)}</td>
                    <td className="px-4 py-3 text-gray-700">{fmt(op.comision)}</td>
                    <td className="px-4 py-3 text-gray-600">{fmtDate(op.fecha_firma)}</td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button onClick={() => openEdit(op)} className="text-gray-400 hover:text-gray-700">Editar</button>
                      <button onClick={() => handleDelete(op.id)} className="text-red-400 hover:text-red-600">Eliminar</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Editar operación">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
            <select value={form.estado} onChange={set('estado')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="en_curso">En curso</option>
              <option value="firmada">Firmada</option>
              <option value="caida">Caída</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio final (€)</label>
              <input type="number" value={form.precio_final} onChange={set('precio_final')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comisión (€)</label>
              <input type="number" value={form.comision} onChange={set('comision')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de firma</label>
            <input type="date" value={form.fecha_firma} onChange={set('fecha_firma')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea rows={3} value={form.notas} onChange={set('notas')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Guardar cambios</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
