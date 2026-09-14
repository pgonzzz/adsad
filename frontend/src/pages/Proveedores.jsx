import { useState, useEffect } from 'react';
import { proveedoresApi } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import ContratosSection from '../components/ContratosSection';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import { useBulkSelect, BulkBar, SelectAllCheckbox, RowCheckbox } from '../components/BulkSelect';

const empty = { tipo: 'inmobiliaria', estado: 'potencial', nombre: '', email: '', telefono: '', empresa: '', notas: '' };

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [confirm, setConfirm] = useState(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    proveedoresApi.getAll({
      ...(filtroTipo ? { tipo: filtroTipo } : {}),
      ...(filtroEstado ? { estado: filtroEstado } : {}),
    })
      .then(setProveedores)
      .finally(() => setLoading(false));
  };

  useEffect(load, [filtroTipo, filtroEstado]);

  const openCreate = () => { setEditing(null); setForm(empty); setModal(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ tipo: p.tipo, estado: p.estado || 'potencial', nombre: p.nombre, email: p.email || '', telefono: p.telefono || '', empresa: p.empresa || '', notas: p.notas || '' });
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (editing) await proveedoresApi.update(editing.id, form);
    else await proveedoresApi.create(form);
    setModal(false);
    load();
  };

  const handleDelete = (id) => {
    setConfirm({
      title: 'Eliminar proveedor',
      message: '¿Seguro que quieres eliminar este proveedor? Esta acción no se puede deshacer.',
      onConfirm: async () => {
        await proveedoresApi.delete(id);
        setConfirm(null);
        load();
        toast.success('Proveedor eliminado');
      },
    });
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const filtered = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (p.empresa || '').toLowerCase().includes(search.toLowerCase())
  );
  const bulk = useBulkSelect(filtered.map(p => p.id));

  const handleBulkDelete = () => {
    const ids = [...bulk.selected];
    if (!ids.length) return;
    setConfirm({
      title: `Eliminar ${ids.length} ${ids.length === 1 ? 'proveedor' : 'proveedores'}`,
      message: `Vas a eliminar ${ids.length} ${ids.length === 1 ? 'proveedor' : 'proveedores'}. Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        const results = await Promise.allSettled(ids.map(id => proveedoresApi.delete(id)));
        const fallos = results.filter(r => r.status === 'rejected').length;
        setConfirm(null);
        bulk.clear();
        load();
        if (fallos) toast.error(`${fallos} no se pudieron eliminar`);
        toast.success(`${ids.length - fallos} proveedores eliminados`);
      },
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Proveedores</h1>
        <button onClick={openCreate} className="px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap">
          + Nuevo proveedor
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b flex gap-3 flex-wrap">
          <input
            type="text" placeholder="Buscar..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full sm:max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los tipos</option>
            <option value="inmobiliaria">Inmobiliaria</option>
            <option value="propietario">Propietario</option>
          </select>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los estados</option>
            <option value="potencial">Potenciales</option>
            <option value="activo">Activos</option>
          </select>
        </div>
        <BulkBar count={bulk.count} onDelete={handleBulkDelete} onClear={bulk.clear} singular="proveedor" plural="proveedores" />
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 w-8"><SelectAllCheckbox bulk={bulk} /></th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Empresa</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Teléfono</th>
              <th className="px-4 py-3">Activos</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">Cargando...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-10 text-gray-400">No hay proveedores</td></tr>
            ) : filtered.map(p => (
              <tr key={p.id} className={`border-b last:border-0 ${bulk.isSelected(p.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}><RowCheckbox bulk={bulk} id={p.id} /></td>
                <td className="px-4 py-3"><Badge value={p.tipo} /></td>
                <td className="px-4 py-3"><Badge value={p.estado || 'potencial'} /></td>
                <td className="px-4 py-3 font-medium text-gray-900">{p.nombre}</td>
                <td className="px-4 py-3 text-gray-600">{p.empresa || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{p.email || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{p.telefono || '—'}</td>
                <td className="px-4 py-3 text-gray-600">{p.propiedades?.length ?? 0}</td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-gray-700">Editar</button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600">Eliminar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar proveedor' : 'Nuevo proveedor'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
            <select required value={form.tipo} onChange={set('tipo')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="inmobiliaria">Inmobiliaria</option>
              <option value="propietario">Propietario</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado *</label>
            <select required value={form.estado} onChange={set('estado')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="potencial">Potencial</option>
              <option value="activo">Activo</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input required value={form.nombre} onChange={set('nombre')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
            <input value={form.empresa} onChange={set('empresa')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
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
              {editing ? 'Guardar cambios' : 'Crear proveedor'}
            </button>
          </div>
        </form>

        {/* Contratos asociados — solo al editar, e invisible si no hay acceso */}
        {editing && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <ContratosSection proveedorId={editing.id} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
