import { useState, useEffect, useRef } from 'react';
import { propiedadesApi, proveedoresApi } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { supabase } from '../lib/supabase';
import { ImagePlus, X, Loader2 } from 'lucide-react';

const TIPOS = ['piso', 'local', 'nave', 'edificio', 'solar', 'otro'];
const ESTADOS = ['disponible', 'en_negociacion', 'vendida'];

const empty = {
  tipo: 'piso', zona: '', precio: '', rentabilidad_bruta: '', rentabilidad_neta: '',
  acepta_financiacion: false, descripcion: '', estado: 'disponible', proveedor_id: '', notas: '',
};

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export default function Propiedades() {
  const [propiedades, setPropiedades] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [fotos, setFotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const fileRef = useRef();

  const loadPropiedades = () => {
    setLoading(true);
    const params = {};
    if (filtroEstado) params.estado = filtroEstado;
    if (filtroTipo) params.tipo = filtroTipo;
    propiedadesApi.getAll(params)
      .then(setPropiedades)
      .finally(() => setLoading(false));
  };

  useEffect(loadPropiedades, [filtroEstado, filtroTipo]);
  useEffect(() => { proveedoresApi.getAll().then(setProveedores); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(empty);
    setFotos([]);
    setModal(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    setForm({
      tipo: p.tipo, zona: p.zona || '', precio: p.precio || '',
      rentabilidad_bruta: p.rentabilidad_bruta || '', rentabilidad_neta: p.rentabilidad_neta || '',
      acepta_financiacion: p.acepta_financiacion || false, descripcion: p.descripcion || '',
      estado: p.estado, proveedor_id: p.proveedor_id || '', notas: p.notas || '',
    });
    setFotos(p.fotos || []);
    setModal(true);
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const nuevasUrls = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('propiedades').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('propiedades').getPublicUrl(path);
        nuevasUrls.push(data.publicUrl);
      }
    }
    setFotos(f => [...f, ...nuevasUrls]);
    setUploading(false);
    fileRef.current.value = '';
  };

  const handleRemoveFoto = async (url) => {
    const path = url.split('/propiedades/')[1];
    await supabase.storage.from('propiedades').remove([path]);
    setFotos(f => f.filter(u => u !== url));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      precio: form.precio ? Number(form.precio) : null,
      rentabilidad_bruta: form.rentabilidad_bruta ? Number(form.rentabilidad_bruta) : null,
      rentabilidad_neta: form.rentabilidad_neta ? Number(form.rentabilidad_neta) : null,
      proveedor_id: form.proveedor_id || null,
      fotos,
    };
    if (editing) await propiedadesApi.update(editing.id, payload);
    else await propiedadesApi.create(payload);
    setModal(false);
    loadPropiedades();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta propiedad?')) return;
    await propiedadesApi.delete(id);
    loadPropiedades();
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const filtered = propiedades.filter(p =>
    (p.zona || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.descripcion || '').toLowerCase().includes(search.toLowerCase()) ||
    (p.proveedores?.nombre || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Propiedades</h1>
        <button onClick={openCreate} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
          + Nueva propiedad
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b flex flex-wrap gap-3">
          <input type="text" placeholder="Buscar zona, descripción..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los tipos</option>
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Foto</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Zona</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Rent. bruta</th>
                <th className="px-4 py-3">Financiación</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">No hay propiedades</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {p.fotos?.length > 0 ? (
                      <img
                        src={p.fotos[0]}
                        alt=""
                        className="w-12 h-12 object-cover rounded-lg cursor-pointer hover:opacity-80"
                        onClick={() => setLightbox(p.fotos[0])}
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                        <ImagePlus size={16} className="text-gray-300" />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">{p.tipo}</span></td>
                  <td className="px-4 py-3 text-gray-900">{p.zona || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{fmt(p.precio)}</td>
                  <td className="px-4 py-3 text-gray-600">{p.rentabilidad_bruta ? `${p.rentabilidad_bruta}%` : '—'}</td>
                  <td className="px-4 py-3">{p.acepta_financiacion ? '✓' : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.proveedores ? (
                      <span>{p.proveedores.nombre} <Badge value={p.proveedores.tipo} /></span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3"><Badge value={p.estado} /></td>
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

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg shadow-xl" />
          <button className="absolute top-4 right-4 text-white hover:text-gray-300">
            <X size={28} />
          </button>
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar propiedad' : 'Nueva propiedad'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
              <select required value={form.tipo} onChange={set('tipo')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select value={form.estado} onChange={set('estado')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Zona</label>
            <input value={form.zona} onChange={set('zona')} placeholder="Ej: Madrid Centro, Málaga..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio (€)</label>
              <input type="number" value={form.precio} onChange={set('precio')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rent. bruta (%)</label>
              <input type="number" step="0.1" value={form.rentabilidad_bruta} onChange={set('rentabilidad_bruta')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rent. neta (%)</label>
              <input type="number" step="0.1" value={form.rentabilidad_neta} onChange={set('rentabilidad_neta')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
            <select value={form.proveedor_id} onChange={set('proveedor_id')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Sin proveedor</option>
              {proveedores.map(p => (
                <option key={p.id} value={p.id}>{p.nombre} ({p.tipo})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea rows={2} value={form.descripcion} onChange={set('descripcion')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.acepta_financiacion}
              onChange={e => setForm(f => ({ ...f, acepta_financiacion: e.target.checked }))} />
            <span className="text-sm text-gray-700">Acepta financiación</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea rows={2} value={form.notas} onChange={set('notas')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* Fotos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Fotos</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {fotos.map(url => (
                <div key={url} className="relative group">
                  <img
                    src={url} alt=""
                    className="w-20 h-20 object-cover rounded-lg cursor-pointer"
                    onClick={() => setLightbox(url)}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveFoto(url)}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
              <label className={`w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading ? <Loader2 size={20} className="text-gray-400 animate-spin" /> : <ImagePlus size={20} className="text-gray-400" />}
                <span className="text-xs text-gray-400 mt-1">{uploading ? 'Subiendo...' : 'Añadir'}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleUpload}
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {editing ? 'Guardar cambios' : 'Crear propiedad'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
