import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, ImagePlus, X, ExternalLink, Phone, Mail } from 'lucide-react';
import { propiedadesApi } from '../api';
import Badge from '../components/Badge';
import { supabase } from '../lib/supabase';

const PIPELINE = [
  { value: 'en_busca',     label: 'En busca',     bg: 'bg-blue-100',   text: 'text-blue-700' },
  { value: 'reservada',    label: 'Reservada',     bg: 'bg-purple-100', text: 'text-purple-700' },
  { value: 'financiacion', label: 'Financiación',  bg: 'bg-amber-100',  text: 'text-amber-700' },
  { value: 'tramites',     label: 'Trámites',      bg: 'bg-orange-100', text: 'text-orange-700' },
  { value: 'comprado',     label: 'Comprado',      bg: 'bg-green-100',  text: 'text-green-700' },
  { value: 'pospuesto',    label: 'Pospuesto',     bg: 'bg-gray-100',   text: 'text-gray-500' },
  { value: 'descartado',   label: 'Descartado',    bg: 'bg-red-100',    text: 'text-red-700' },
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

function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="text-gray-400 w-36 shrink-0 text-sm">{label}</span>
      <span className="text-gray-900 text-sm font-medium">{value}</span>
    </div>
  );
}

export default function PropiedadDetalle() {
  const { id } = useParams();
  const [propiedad, setPropiedad] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = () => {
    setLoading(true);
    propiedadesApi.getById(id)
      .then(setPropiedad)
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setUploading(true);
    const nuevasUrls = [...(propiedad.fotos || [])];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('propiedades').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('propiedades').getPublicUrl(path);
        nuevasUrls.push(data.publicUrl);
      }
    }
    await propiedadesApi.update(id, { fotos: nuevasUrls });
    setUploading(false);
    load();
  };

  const handleRemoveFoto = async (url) => {
    if (!confirm('¿Eliminar esta foto?')) return;
    const path = url.split('/propiedades/')[1];
    await supabase.storage.from('propiedades').remove([path]);
    const fotos = (propiedad.fotos || []).filter(u => u !== url);
    await propiedadesApi.update(id, { fotos });
    load();
  };

  if (loading) return <p className="text-gray-400 text-sm">Cargando...</p>;
  if (!propiedad) return <p className="text-red-500 text-sm">Propiedad no encontrada</p>;

  const ubicacion = [propiedad.poblacion, propiedad.provincia].filter(Boolean).join(', ');

  return (
    <div>
      <Link to="/propiedades" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={14} /> Propiedades
      </Link>

      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
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
          </div>
        </div>

        {(propiedad.descripcion || propiedad.notas) && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
            {propiedad.descripcion && <p className="text-sm text-gray-600">{propiedad.descripcion}</p>}
            {propiedad.notas && <p className="text-sm text-gray-400 italic">{propiedad.notas}</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Fotos */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Fotos</h2>
          <div className="flex flex-wrap gap-3">
            {(propiedad.fotos || []).map(url => (
              <div key={url} className="relative group">
                <img
                  src={url} alt=""
                  className="w-28 h-28 object-cover rounded-lg cursor-pointer hover:opacity-90"
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
            <label className={`w-28 h-28 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <ImagePlus size={22} className="text-gray-400" />
              <span className="text-xs text-gray-400 mt-1">{uploading ? 'Subiendo...' : 'Añadir foto'}</span>
              <input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
            </label>
          </div>
        </div>

        {/* Proveedor */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Proveedor</h2>
          {propiedad.proveedores ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{propiedad.proveedores.nombre}</span>
                <Badge value={propiedad.proveedores.tipo} />
              </div>
              {propiedad.proveedores.telefono && (
                <a href={`tel:${propiedad.proveedores.telefono}`}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
                  <Phone size={13} /> {propiedad.proveedores.telefono}
                </a>
              )}
              {propiedad.proveedores.email && (
                <a href={`mailto:${propiedad.proveedores.email}`}
                  className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600">
                  <Mail size={13} /> {propiedad.proveedores.email}
                </a>
              )}
              <Link to="/proveedores" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                <ExternalLink size={11} /> Ver proveedor
              </Link>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin proveedor asignado</p>
          )}
        </div>
      </div>

      {/* Peticiones que encajan */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Inversores que encajan</h2>
          <p className="text-xs text-gray-400 mt-0.5">Peticiones activas compatibles con esta propiedad (tipo, precio, zona, financiación)</p>
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
                    <Link
                      to={`/inversores/${p.inversores?.id}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {p.inversores ? [p.inversores.nombre, p.inversores.apellidos].filter(Boolean).join(' ') : '—'}
                    </Link>
                    {p.inversores?.pipeline && <PipelineTag value={p.inversores.pipeline} />}
                    {p.necesita_financiacion && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Con financiación</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                    {p.tipos_propiedad?.length > 0 && (
                      <span>Tipos: {p.tipos_propiedad.join(', ')}</span>
                    )}
                    {(p.precio_min || p.precio_max) && (
                      <span>Precio: {fmt(p.precio_min)} – {fmt(p.precio_max)}</span>
                    )}
                    {(p.provincia || p.poblacion) && (
                      <span>Zona: {[p.poblacion, p.provincia].filter(Boolean).join(', ')}</span>
                    )}
                    {p.rentabilidad_min && <span>Rent. mín: {p.rentabilidad_min}%</span>}
                  </div>
                  {p.notas && <p className="text-xs text-gray-400">{p.notas}</p>}
                </div>
                <div className="flex gap-2 shrink-0">
                  {p.inversores?.telefono && (
                    <a href={`tel:${p.inversores.telefono}`}
                      className="p-1.5 text-gray-400 hover:text-green-600 rounded"
                      title="Llamar">
                      <Phone size={14} />
                    </a>
                  )}
                  <Link to={`/inversores/${p.inversores?.id}`}
                    className="p-1.5 text-gray-400 hover:text-blue-600 rounded"
                    title="Ver inversor">
                    <ExternalLink size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg shadow-xl" />
          <button className="absolute top-4 right-4 text-white hover:text-gray-300"><X size={28} /></button>
        </div>
      )}
    </div>
  );
}
