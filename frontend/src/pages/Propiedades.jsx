import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { propiedadesApi, proveedoresApi } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import { supabase } from '../lib/supabase';
import { ImagePlus, X, Loader2, SlidersHorizontal, ChevronDown, Paperclip, FileText } from 'lucide-react';
import Combobox, { ComboboxMunicipios } from '../components/Combobox';
import { PROVINCIAS } from '../data/municipios';
import TagsInput, { TagsDisplay } from '../components/TagsInput';

const TIPOS = ['piso', 'local', 'nave', 'edificio', 'solar', 'otro'];
const ESTADOS = ['disponible', 'reservada', 'en_negociacion', 'vendida'];

const empty = {
  tipo: 'piso', provincia: '', poblacion: '', direccion: '',
  precio: '', rentabilidad_bruta: '', rentabilidad_neta: '',
  m2: '', habitaciones: '', banos: '', planta: '',
  anio_construccion: '', ref_catastral: '',
  acepta_financiacion: false, descripcion: '', estado: 'disponible',
  proveedor_id: '', notas: '', tags: [],
};

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

// Abanico de hasta 3 fotos
function FotosFan({ fotos, onClick }) {
  if (!fotos?.length) return (
    <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center shrink-0">
      <ImagePlus size={16} className="text-gray-300" />
    </div>
  );
  const preview = fotos.slice(0, 3);
  const rotations = [-7, -2, 4];
  return (
    <div
      className="relative w-14 h-14 shrink-0 cursor-pointer"
      onClick={e => { e.stopPropagation(); onClick && onClick(fotos[0]); }}
    >
      {preview.map((url, i) => (
        <img
          key={url}
          src={url}
          alt=""
          className="absolute w-12 h-12 object-cover rounded-lg border-2 border-white shadow-sm"
          style={{ transform: `rotate(${rotations[i]}deg)`, zIndex: i + 1, top: 1, left: i * 2 }}
        />
      ))}
    </div>
  );
}

export default function Propiedades() {
  const navigate = useNavigate();
  const [propiedades, setPropiedades] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [fotos, setFotos] = useState([]);
  const [adjuntos, setAdjuntos] = useState([]); // [{nombre, url}]
  const [uploading, setUploading] = useState(false);
  const [uploadingAdj, setUploadingAdj] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const fileRef = useRef();
  const adjRef = useRef();

  // Filters
  const [fProvincia, setFProvincia] = useState('');
  const [fPoblacion, setFPoblacion] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [fPrecioMin, setFPrecioMin] = useState('');
  const [fPrecioMax, setFPrecioMax] = useState('');
  const [fRentMin, setFRentMin] = useState('');
  const [fRentMax, setFRentMax] = useState('');
  const [fFinanciacion, setFFinanciacion] = useState('');
  const [search, setSearch] = useState('');

  const activeFilters = [fProvincia, fPoblacion, fEstado, fTipo, fPrecioMin, fPrecioMax, fRentMin, fRentMax, fFinanciacion].filter(Boolean).length;

  const loadPropiedades = () => {
    setLoading(true);
    propiedadesApi.getAll().then(setPropiedades).finally(() => setLoading(false));
  };

  useEffect(loadPropiedades, []);
  useEffect(() => { proveedoresApi.getAll().then(setProveedores); }, []);

  const openCreate = () => {
    setEditing(null); setForm(empty); setFotos([]); setAdjuntos([]); setModal(true);
  };

  const openEdit = (p, e) => {
    e.stopPropagation();
    setEditing(p);
    setForm({
      tipo: p.tipo, provincia: p.provincia || '', poblacion: p.poblacion || '',
      direccion: p.direccion || '',
      precio: p.precio || '', rentabilidad_bruta: p.rentabilidad_bruta || '',
      rentabilidad_neta: p.rentabilidad_neta || '',
      m2: p.m2 || '', habitaciones: p.habitaciones || '', banos: p.banos || '',
      planta: p.planta || '', anio_construccion: p.anio_construccion || '',
      ref_catastral: p.ref_catastral || '',
      acepta_financiacion: p.acepta_financiacion || false, descripcion: p.descripcion || '',
      estado: p.estado, proveedor_id: p.proveedor_id || '', notas: p.notas || '',
      tags: p.tags || [],
    });
    setFotos(p.fotos || []);
    setAdjuntos(p.adjuntos || []);
    setModal(true);
  };

  const handleUploadFoto = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const nuevas = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `fotos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('propiedades').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('propiedades').getPublicUrl(path);
        nuevas.push(data.publicUrl);
      }
    }
    setFotos(f => [...f, ...nuevas]);
    setUploading(false);
    fileRef.current.value = '';
  };

  const handleRemoveFoto = async (url) => {
    const path = url.split('/propiedades/')[1];
    await supabase.storage.from('propiedades').remove([path]);
    setFotos(f => f.filter(u => u !== url));
  };

  const handleUploadAdj = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingAdj(true);
    const nuevos = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `adjuntos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('propiedades').upload(path, file, { contentType: file.type });
      if (!error) {
        const { data } = supabase.storage.from('propiedades').getPublicUrl(path);
        nuevos.push({ nombre: file.name, url: data.publicUrl });
      }
    }
    setAdjuntos(a => [...a, ...nuevos]);
    setUploadingAdj(false);
    adjRef.current.value = '';
  };

  const handleRemoveAdj = async (adj) => {
    const path = adj.url.split('/propiedades/')[1];
    await supabase.storage.from('propiedades').remove([path]);
    setAdjuntos(a => a.filter(x => x.url !== adj.url));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      precio: form.precio ? Number(form.precio) : null,
      rentabilidad_bruta: form.rentabilidad_bruta ? Number(form.rentabilidad_bruta) : null,
      rentabilidad_neta: form.rentabilidad_neta ? Number(form.rentabilidad_neta) : null,
      m2: form.m2 ? Number(form.m2) : null,
      habitaciones: form.habitaciones ? parseInt(form.habitaciones, 10) : null,
      banos: form.banos ? parseInt(form.banos, 10) : null,
      anio_construccion: form.anio_construccion ? parseInt(form.anio_construccion, 10) : null,
      proveedor_id: form.proveedor_id || null,
      tags: form.tags || [],
      fotos,
      adjuntos,
    };
    if (editing) await propiedadesApi.update(editing.id, payload);
    else await propiedadesApi.create(payload);
    setModal(false);
    loadPropiedades();
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!confirm('¿Eliminar esta propiedad?')) return;
    await propiedadesApi.delete(id);
    loadPropiedades();
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const clearFilters = () => {
    setFProvincia(''); setFPoblacion(''); setFEstado(''); setFTipo('');
    setFPrecioMin(''); setFPrecioMax(''); setFRentMin(''); setFRentMax('');
    setFFinanciacion(''); setSearch('');
  };

  // Todos los tags usados en alguna propiedad (para sugerencias)
  const existingTags = Array.from(
    new Set(propiedades.flatMap(p => p.tags || []))
  ).sort();

  const filtered = propiedades.filter(p => {
    if (search && !(
      (p.provincia || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.poblacion || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.direccion || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.descripcion || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.proveedores?.nombre || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.tags || []).some(t => t.includes(search.toLowerCase()))
    )) return false;
    if (fProvincia && p.provincia !== fProvincia) return false;
    if (fPoblacion && !(p.poblacion || '').toLowerCase().includes(fPoblacion.toLowerCase())) return false;
    if (fEstado && p.estado !== fEstado) return false;
    if (fTipo && p.tipo !== fTipo) return false;
    if (fPrecioMin && (p.precio || 0) < Number(fPrecioMin)) return false;
    if (fPrecioMax && (p.precio || 0) > Number(fPrecioMax)) return false;
    if (fRentMin && (p.rentabilidad_bruta || 0) < Number(fRentMin)) return false;
    if (fRentMax && (p.rentabilidad_bruta || 0) > Number(fRentMax)) return false;
    if (fFinanciacion === 'si' && !p.acepta_financiacion) return false;
    if (fFinanciacion === 'no' && p.acepta_financiacion) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Propiedades</h1>
        <button onClick={openCreate} className="px-3 sm:px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap">
          + Nueva propiedad
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        {/* Search + filter toggle */}
        <div className="p-4 border-b flex flex-wrap gap-3 items-center">
          <input type="text" placeholder="Buscar provincia, población, descripción..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <button
            onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm transition-colors ${showFilters || activeFilters > 0 ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          >
            <SlidersHorizontal size={14} />
            Filtros
            {activeFilters > 0 && (
              <span className="bg-blue-600 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">{activeFilters}</span>
            )}
            <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
          {activeFilters > 0 && (
            <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-gray-600">Limpiar filtros</button>
          )}
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="p-4 border-b bg-gray-50 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Provincia</label>
              <Combobox options={PROVINCIAS} value={fProvincia} onChange={v => { setFProvincia(v); setFPoblacion(''); }} placeholder="Todas" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Población</label>
              <ComboboxMunicipios provincia={fProvincia} value={fPoblacion} onChange={setFPoblacion} placeholder="Todas" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tipo</label>
              <select value={fTipo} onChange={e => setFTipo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos</option>
                {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Estado</label>
              <select value={fEstado} onChange={e => setFEstado(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Todos</option>
                {ESTADOS.map(e => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Precio mín (€)</label>
              <input type="number" value={fPrecioMin} onChange={e => setFPrecioMin(e.target.value)} placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Precio máx (€)</label>
              <input type="number" value={fPrecioMax} onChange={e => setFPrecioMax(e.target.value)} placeholder="Sin límite"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rent. bruta mín (%)</label>
              <input type="number" step="0.1" value={fRentMin} onChange={e => setFRentMin(e.target.value)} placeholder="0"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rent. bruta máx (%)</label>
              <input type="number" step="0.1" value={fRentMax} onChange={e => setFRentMax(e.target.value)} placeholder="Sin límite"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Acepta financiación</label>
              <select value={fFinanciacion} onChange={e => setFFinanciacion(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Indiferente</option>
                <option value="si">Sí</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Fotos</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Provincia / Población</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Rent. bruta</th>
                <th className="px-4 py-3">Financiación</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-10 text-gray-400">No hay propiedades</td></tr>
              ) : filtered.map(p => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/propiedades/${p.id}`)}>
                  <td className="px-4 py-3">
                    <FotosFan fotos={p.fotos} onClick={url => setLightbox(url)} />
                  </td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium capitalize">{p.tipo}</span></td>
                  <td className="px-4 py-3"><Badge value={p.estado} /></td>
                  <td className="px-4 py-3 text-gray-900">
                    <div>
                      {p.provincia || p.poblacion ? (
                        <span>{p.provincia || ''}{p.provincia && p.poblacion ? ' / ' : ''}{p.poblacion || ''}</span>
                      ) : '—'}
                      {(p.m2 || p.habitaciones) && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {p.m2 ? `${p.m2} m²` : ''}
                          {p.m2 && p.habitaciones ? ' · ' : ''}
                          {p.habitaciones ? `${p.habitaciones} hab` : ''}
                          {p.banos ? ` · ${p.banos} bañ` : ''}
                        </div>
                      )}
                      {p.tags?.length > 0 && (
                        <div className="mt-1"><TagsDisplay tags={p.tags} size="sm" max={3} /></div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {fmt(p.precio)}
                    {p.precio && p.m2 && (
                      <div className="text-xs text-gray-400 font-normal">
                        {Math.round(p.precio / p.m2)} €/m²
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.rentabilidad_bruta ? `${p.rentabilidad_bruta}%` : '—'}</td>
                  <td className="px-4 py-3">{p.acepta_financiacion ? '✓' : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.proveedores ? <span>{p.proveedores.nombre} <Badge value={p.proveedores.tipo} /></span> : '—'}
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => navigate(`/propiedades/${p.id}`)}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                      >
                        Ficha
                      </button>
                      <button onClick={(e) => openEdit(p, e)} className="text-gray-400 hover:text-gray-700 text-xs">Editar</button>
                      <button onClick={(e) => handleDelete(p.id, e)} className="text-red-400 hover:text-red-600 text-xs">Eliminar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg shadow-xl" />
          <button className="absolute top-4 right-4 text-white hover:text-gray-300"><X size={28} /></button>
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
              <Combobox options={PROVINCIAS} value={form.provincia} onChange={v => setForm(f => ({ ...f, provincia: v, poblacion: '' }))} placeholder="Selecciona provincia" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Población</label>
              <ComboboxMunicipios provincia={form.provincia} value={form.poblacion} onChange={v => setForm(f => ({ ...f, poblacion: v }))} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Dirección (calle y número)</label>
            <input type="text" value={form.direccion} onChange={set('direccion')}
              placeholder="Ej: Calle Mayor 24"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">Si la rellenas, verás un mapa en la ficha de la propiedad.</p>
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
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">m²</label>
              <input type="number" value={form.m2} onChange={set('m2')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Habs.</label>
              <input type="number" value={form.habitaciones} onChange={set('habitaciones')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Baños</label>
              <input type="number" value={form.banos} onChange={set('banos')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Planta</label>
              <input type="text" value={form.planta} onChange={set('planta')}
                placeholder="3ª ext."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Año construcción</label>
              <input type="number" value={form.anio_construccion} onChange={set('anio_construccion')}
                placeholder="1975"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Referencia catastral</label>
              <input type="text" value={form.ref_catastral} onChange={set('ref_catastral')}
                placeholder="9872023VH5697S0001WX"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Etiquetas</label>
            <TagsInput
              value={form.tags}
              onChange={tags => setForm(f => ({ ...f, tags }))}
              suggestions={existingTags}
              placeholder="Ej: reformada, inversor, exterior… (enter)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
            <select value={form.proveedor_id} onChange={set('proveedor_id')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Sin proveedor</option>
              {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.tipo})</option>)}
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
            <div className="flex flex-wrap gap-2">
              {fotos.map(url => (
                <div key={url} className="relative group">
                  <img src={url} alt="" className="w-20 h-20 object-cover rounded-lg cursor-pointer" onClick={() => setLightbox(url)} />
                  <button type="button" onClick={() => handleRemoveFoto(url)}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={10} />
                  </button>
                </div>
              ))}
              <label className={`w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
                {uploading ? <Loader2 size={18} className="text-gray-400 animate-spin" /> : <ImagePlus size={18} className="text-gray-400" />}
                <span className="text-xs text-gray-400 mt-1">{uploading ? 'Subiendo...' : 'Añadir'}</span>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadFoto} />
              </label>
            </div>
          </div>

          {/* Adjuntos */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Adjuntos</label>
            <div className="space-y-2 mb-2">
              {adjuntos.map(adj => (
                <div key={adj.url} className="flex items-center gap-2 p-2 bg-gray-50 border border-gray-200 rounded-lg">
                  <FileText size={14} className="text-gray-400 shrink-0" />
                  <a href={adj.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 text-sm text-blue-600 hover:underline truncate">{adj.nombre}</a>
                  <button type="button" onClick={() => handleRemoveAdj(adj)} className="text-gray-400 hover:text-red-500">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <label className={`inline-flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm text-gray-500 cursor-pointer hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors ${uploadingAdj ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploadingAdj ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
              {uploadingAdj ? 'Subiendo...' : 'Añadir adjunto'}
              <input ref={adjRef} type="file" multiple className="hidden" onChange={handleUploadAdj} />
            </label>
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
