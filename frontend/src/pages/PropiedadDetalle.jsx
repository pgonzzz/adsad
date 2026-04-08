import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ImagePlus, X, ExternalLink, Phone, Mail, Building2,
  FileText, Paperclip, Loader2, Download, Pencil, Check, Send, User2
} from 'lucide-react';
import { propiedadesApi, proveedoresApi } from '../api';
import Badge from '../components/Badge';
import { supabase } from '../lib/supabase';

const PIPELINE = [
  { value: 'en_busca',     label: 'En busca',    bg: 'bg-blue-100',   text: 'text-blue-700' },
  { value: 'reservada',    label: 'Reservada',    bg: 'bg-purple-100', text: 'text-purple-700' },
  { value: 'financiacion', label: 'Financiación', bg: 'bg-amber-100',  text: 'text-amber-700' },
  { value: 'tramites',     label: 'Trámites',     bg: 'bg-orange-100', text: 'text-orange-700' },
  { value: 'comprado',     label: 'Comprado',     bg: 'bg-green-100',  text: 'text-green-700' },
  { value: 'pospuesto',    label: 'Pospuesto',    bg: 'bg-gray-100',   text: 'text-gray-500' },
  { value: 'descartado',   label: 'Descartado',   bg: 'bg-red-100',    text: 'text-red-700' },
];

function PipelineTag({ value }) {
  const stage = PIPELINE.find(p => p.value === value) || PIPELINE[0];
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stage.bg} ${stage.text}`}>
      {stage.label}
    </span>
  );
}

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' · ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function avatarInitials(name) {
  if (!name) return '?';
  const parts = name.split(/[\s@]/);
  return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

export default function PropiedadDetalle() {
  const { id } = useParams();
  const [propiedad, setPropiedad] = useState(null);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [uploadingAdj, setUploadingAdj] = useState(false);

  // Propietario
  const [editPropietario, setEditPropietario] = useState(false);
  const [selectedProveedor, setSelectedProveedor] = useState('');
  const [savingProveedor, setSavingProveedor] = useState(false);

  // Comentarios / notas
  const [nuevoComentario, setNuevoComentario] = useState('');
  const [savingComentario, setSavingComentario] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const textareaRef = useRef();

  const load = () => {
    setLoading(true);
    propiedadesApi.getById(id).then(p => {
      setPropiedad(p);
      setSelectedProveedor(p.proveedor_id || '');
    }).finally(() => setLoading(false));
  };

  useEffect(load, [id]);
  useEffect(() => { proveedoresApi.getAll().then(setProveedores); }, []);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUser(data.user);
    });
  }, []);

  // ── Fotos ──────────────────────────────────────────────────────────────────
  const handleUploadFoto = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingFoto(true);
    const nuevas = [...(propiedad.fotos || [])];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `fotos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('propiedades').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('propiedades').getPublicUrl(path);
        nuevas.push(data.publicUrl);
      }
    }
    await propiedadesApi.update(id, { fotos: nuevas });
    setUploadingFoto(false);
    load();
  };

  const handleRemoveFoto = async (url) => {
    if (!confirm('¿Eliminar esta foto?')) return;
    const path = url.split('/propiedades/')[1];
    await supabase.storage.from('propiedades').remove([path]);
    await propiedadesApi.update(id, { fotos: (propiedad.fotos || []).filter(u => u !== url) });
    load();
  };

  // ── Adjuntos ───────────────────────────────────────────────────────────────
  const handleUploadAdj = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploadingAdj(true);
    const nuevos = [...(propiedad.adjuntos || [])];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `adjuntos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('propiedades').upload(path, file, { contentType: file.type });
      if (!error) {
        const { data } = supabase.storage.from('propiedades').getPublicUrl(path);
        nuevos.push({ nombre: file.name, url: data.publicUrl });
      }
    }
    await propiedadesApi.update(id, { adjuntos: nuevos });
    setUploadingAdj(false);
    load();
  };

  const handleRemoveAdj = async (adj) => {
    if (!confirm(`¿Eliminar "${adj.nombre}"?`)) return;
    const path = adj.url.split('/propiedades/')[1];
    await supabase.storage.from('propiedades').remove([path]);
    await propiedadesApi.update(id, { adjuntos: (propiedad.adjuntos || []).filter(a => a.url !== adj.url) });
    load();
  };

  // ── Propietario ────────────────────────────────────────────────────────────
  const handleGuardarProveedor = async () => {
    setSavingProveedor(true);
    await propiedadesApi.update(id, { proveedor_id: selectedProveedor || null });
    setSavingProveedor(false);
    setEditPropietario(false);
    load();
  };

  // ── Comentarios ────────────────────────────────────────────────────────────
  const handleAddComentario = async () => {
    const texto = nuevoComentario.trim();
    if (!texto) return;
    setSavingComentario(true);
    const comentarios = [...(propiedad.comentarios || [])];
    const userName = currentUser?.user_metadata?.full_name
      || currentUser?.email?.split('@')[0]
      || 'Usuario';
    comentarios.push({
      id: Date.now().toString(),
      texto,
      usuario: userName,
      email: currentUser?.email || '',
      created_at: new Date().toISOString(),
    });
    await propiedadesApi.update(id, { comentarios });
    setNuevoComentario('');
    setSavingComentario(false);
    load();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleAddComentario();
    }
  };

  const handleDeleteComentario = async (cId) => {
    if (!confirm('¿Eliminar este comentario?')) return;
    const comentarios = (propiedad.comentarios || []).filter(c => c.id !== cId);
    await propiedadesApi.update(id, { comentarios });
    load();
  };

  if (loading) return <p className="text-gray-400 text-sm">Cargando...</p>;
  if (!propiedad) return <p className="text-red-500 text-sm">Propiedad no encontrada</p>;

  const ubicacion = [propiedad.poblacion, propiedad.provincia].filter(Boolean).join(', ');
  const prov = propiedad.proveedores;
  const comentarios = propiedad.comentarios || [];

  return (
    <div>
      <Link to="/propiedades" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={14} /> Propiedades
      </Link>

      {/* ── Cabecera ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-2xl font-bold text-gray-900 capitalize">{propiedad.tipo}</h1>
              <Badge value={propiedad.estado} />
              {propiedad.acepta_financiacion && (
                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Acepta financiación</span>
              )}
            </div>
            {ubicacion && <p className="text-gray-500 text-sm mb-3">{ubicacion}</p>}
            <div className="flex flex-wrap gap-6">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Precio</p>
                <p className="text-xl font-bold text-gray-900">{fmt(propiedad.precio)}</p>
              </div>
              {propiedad.rentabilidad_bruta && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Rent. bruta</p>
                  <p className="text-xl font-bold text-blue-600">{propiedad.rentabilidad_bruta}%</p>
                </div>
              )}
              {propiedad.rentabilidad_neta && (
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Rent. neta</p>
                  <p className="text-xl font-bold text-indigo-600">{propiedad.rentabilidad_neta}%</p>
                </div>
              )}
            </div>
            {propiedad.descripcion && (
              <p className="mt-3 text-sm text-gray-600">{propiedad.descripcion}</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">

        {/* ── Fotos ── */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Fotos</h2>
          <div className="flex flex-wrap gap-3">
            {(propiedad.fotos || []).map(url => (
              <div key={url} className="relative group">
                <img
                  src={url} alt=""
                  className="w-28 h-28 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                  onClick={() => setLightbox(url)}
                />
                <button
                  onClick={() => handleRemoveFoto(url)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
            <label className={`w-28 h-28 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors ${uploadingFoto ? 'opacity-50 pointer-events-none' : ''}`}>
              {uploadingFoto ? <Loader2 size={22} className="text-gray-400 animate-spin" /> : <ImagePlus size={22} className="text-gray-400" />}
              <span className="text-xs text-gray-400 mt-1">{uploadingFoto ? 'Subiendo...' : 'Añadir foto'}</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleUploadFoto} />
            </label>
          </div>
        </div>

        {/* ── Propietario ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Propietario</h2>
            <button
              onClick={() => setEditPropietario(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Pencil size={11} />
              {prov ? 'Cambiar' : 'Asignar'}
            </button>
          </div>

          {/* Selector inline */}
          {editPropietario && (
            <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
              <select
                value={selectedProveedor}
                onChange={e => setSelectedProveedor(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">— Sin propietario —</option>
                {proveedores.map(p => (
                  <option key={p.id} value={p.id}>{p.nombre} ({p.tipo})</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button
                  onClick={handleGuardarProveedor}
                  disabled={savingProveedor}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                >
                  <Check size={11} /> {savingProveedor ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => setEditPropietario(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {prov ? (
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center shrink-0">
                  <Building2 size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{prov.nombre}</p>
                  <Badge value={prov.tipo} />
                </div>
              </div>
              {prov.empresa && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Building2 size={13} className="text-gray-400 shrink-0" />
                  <span>{prov.empresa}</span>
                </div>
              )}
              {prov.telefono && (
                <a href={`tel:${prov.telefono}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
                  <Phone size={13} className="text-gray-400 shrink-0" />
                  {prov.telefono}
                </a>
              )}
              {prov.email && (
                <a href={`mailto:${prov.email}`} className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 break-all">
                  <Mail size={13} className="text-gray-400 shrink-0" />
                  {prov.email}
                </a>
              )}
              <Link to="/proveedores" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                <ExternalLink size={11} /> Ver ficha proveedor
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin propietario asignado</p>
          )}
        </div>
      </div>

      {/* ── Adjuntos ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Adjuntos</h2>
          <label className={`inline-flex items-center gap-2 px-3 py-1.5 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 cursor-pointer hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50 transition-colors ${uploadingAdj ? 'opacity-50 pointer-events-none' : ''}`}>
            {uploadingAdj ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
            {uploadingAdj ? 'Subiendo...' : 'Añadir adjunto'}
            <input type="file" multiple className="hidden" onChange={handleUploadAdj} />
          </label>
        </div>
        {!(propiedad.adjuntos?.length) ? (
          <p className="text-sm text-gray-400">No hay adjuntos. Puedes añadir contratos, planos, etc.</p>
        ) : (
          <div className="space-y-2">
            {propiedad.adjuntos.map(adj => (
              <div key={adj.url} className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg group">
                <FileText size={16} className="text-gray-400 shrink-0" />
                <span className="flex-1 text-sm text-gray-700 truncate">{adj.nombre}</span>
                <a href={adj.url} target="_blank" rel="noopener noreferrer"
                  className="p-1 text-gray-400 hover:text-blue-600 rounded" title="Descargar">
                  <Download size={14} />
                </a>
                <button onClick={() => handleRemoveAdj(adj)}
                  className="p-1 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Notas / Comentarios ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4">Notas</h2>

        {/* Lista de comentarios */}
        {comentarios.length > 0 && (
          <div className="space-y-4 mb-5">
            {comentarios.map(c => (
              <div key={c.id} className="flex gap-3 group">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                  {avatarInitials(c.usuario)}
                </div>
                {/* Contenido */}
                <div className="flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">{c.usuario}</span>
                    <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap">{c.texto}</p>
                </div>
                {/* Eliminar */}
                <button
                  onClick={() => handleDeleteComentario(c.id)}
                  className="p-1 text-gray-300 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
                  title="Eliminar nota"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {comentarios.length === 0 && (
          <p className="text-sm text-gray-400 mb-4">Sin notas todavía.</p>
        )}

        {/* Input nueva nota */}
        <div className="flex gap-3 items-start">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-xs font-bold shrink-0 mt-0.5">
            {currentUser ? avatarInitials(currentUser.user_metadata?.full_name || currentUser.email) : <User2 size={14} />}
          </div>
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              rows={2}
              value={nuevoComentario}
              onChange={e => setNuevoComentario(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Añade una nota... (Cmd+Enter para guardar)"
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none pr-12"
            />
            <button
              onClick={handleAddComentario}
              disabled={!nuevoComentario.trim() || savingComentario}
              className="absolute right-2.5 bottom-2.5 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Guardar nota"
            >
              {savingComentario ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1.5 ml-11">Cmd+Enter para guardar</p>
      </div>

      {/* ── Inversores que encajan ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Inversores que encajan</h2>
          <p className="text-xs text-gray-400 mt-0.5">Peticiones activas compatibles con esta propiedad</p>
        </div>
        {!propiedad.peticionesMatch?.length ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            No hay peticiones activas que encajen con esta propiedad ahora mismo
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {propiedad.peticionesMatch.map(p => (
              <div key={p.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link to={`/inversores/${p.inversores?.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {p.inversores ? [p.inversores.nombre, p.inversores.apellidos].filter(Boolean).join(' ') : '—'}
                    </Link>
                    {p.inversores?.pipeline && <PipelineTag value={p.inversores.pipeline} />}
                    {p.necesita_financiacion && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Con financiación</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    {p.tipos_propiedad?.length > 0 && <span>Tipos: {p.tipos_propiedad.join(', ')}</span>}
                    {(p.precio_min || p.precio_max) && <span>Precio: {fmt(p.precio_min)} – {fmt(p.precio_max)}</span>}
                    {(p.provincia || p.poblacion) && <span>Zona: {[p.poblacion, p.provincia].filter(Boolean).join(', ')}</span>}
                    {p.rentabilidad_min && <span>Rent. mín: {p.rentabilidad_min}%</span>}
                  </div>
                  {p.notas && <p className="text-xs text-gray-400">{p.notas}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {p.inversores?.telefono && (
                    <a href={`tel:${p.inversores.telefono}`} className="p-1.5 text-gray-400 hover:text-green-600 rounded" title="Llamar">
                      <Phone size={14} />
                    </a>
                  )}
                  <Link to={`/inversores/${p.inversores?.id}`} className="p-1.5 text-gray-400 hover:text-blue-600 rounded" title="Ver inversor">
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Lightbox ── */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg shadow-xl" />
          <button className="absolute top-4 right-4 text-white hover:text-gray-300"><X size={28} /></button>
        </div>
      )}
    </div>
  );
}
