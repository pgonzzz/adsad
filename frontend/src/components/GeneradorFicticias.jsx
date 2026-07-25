import { useState, useRef } from 'react';
import Modal from './Modal';
import { generadorApi } from '../api';
import { supabase } from '../lib/supabase';
import { Loader2, Sparkles, ImagePlus, RefreshCw, ArrowLeft, BedDouble, Bath, Ruler, TrendingUp, X } from 'lucide-react';

const MAX_BASES = 4; // límite de imágenes de referencia de gpt-image-2

const fmtEur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export default function GeneradorFicticias({ isOpen, onClose, onCreated }) {
  const [n, setN] = useState(10);
  const [opciones, setOpciones] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [sel, setSel] = useState(null);
  const [imagenesBase, setImagenesBase] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef();

  const reset = () => {
    setOpciones([]); setSel(null); setImagenesBase([]); setError(''); setCreando(false);
  };

  const handleClose = () => {
    if (creando) return; // no cerrar mientras genera
    reset();
    onClose();
  };

  const cargarOpciones = async () => {
    setCargando(true); setError('');
    try {
      setOpciones(await generadorApi.opciones(n));
    } catch (err) {
      setError(err.response?.data?.error || 'Error generando opciones');
    }
    setCargando(false);
  };

  const subirArchivos = async (archivos) => {
    const files = archivos.filter(f => f.type.startsWith('image/')).slice(0, MAX_BASES - imagenesBase.length);
    if (!files.length) return;
    setSubiendo(true); setError('');
    const nuevas = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const path = `fotos/base-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: err } = await supabase.storage.from('propiedades').upload(path, file);
      if (err) { setError(err.message); continue; }
      nuevas.push(supabase.storage.from('propiedades').getPublicUrl(path).data.publicUrl);
    }
    setImagenesBase(prev => [...prev, ...nuevas].slice(0, MAX_BASES));
    setSubiendo(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleUploadBase = (e) => subirArchivos(Array.from(e.target.files || []));

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (creando || subiendo || imagenesBase.length >= MAX_BASES) return;
    subirArchivos(Array.from(e.dataTransfer.files || []));
  };

  const handleCrear = async () => {
    setCreando(true); setError('');
    try {
      const res = await generadorApi.crear(sel, imagenesBase);
      reset();
      onCreated(res.propiedad, res.fallidas);
    } catch (err) {
      setError(err.response?.data?.error || 'Error creando la propiedad');
      setCreando(false);
    }
  };

  const numFotos = sel ? 3 + Math.min(sel.habitaciones, 4) + (sel.banos > 1 ? 1 : 0) + 1 : 0;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={sel ? 'Crear propiedad ficticia' : 'Generar propiedades ficticias'} size="lg">
      {!sel ? (
        <div>
          <div className="flex items-end gap-3 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nº de opciones</label>
              <input type="number" min={1} max={20} value={n} onChange={e => setN(e.target.value)}
                className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button onClick={cargarOpciones} disabled={cargando}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-60 flex items-center gap-2">
              {cargando ? <Loader2 size={15} className="animate-spin" /> : opciones.length ? <RefreshCw size={15} /> : <Sparkles size={15} />}
              {opciones.length ? 'Generar otras' : 'Generar opciones'}
            </button>
          </div>

          {opciones.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {opciones.map((o, i) => (
                <button key={i} onClick={() => setSel(o)}
                  className="text-left border border-gray-200 rounded-xl p-4 hover:border-violet-400 hover:bg-violet-50 transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-gray-900 text-sm">{o.poblacion} <span className="text-gray-400 font-normal">({o.provincia})</span></span>
                    <span className="text-sm font-bold text-gray-900">{fmtEur(o.precio)}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                    <span className="flex items-center gap-1"><Ruler size={12} /> {o.m2} m²</span>
                    <span className="flex items-center gap-1"><TrendingUp size={12} /> {o.rentabilidad_bruta}% bruta</span>
                    <span className="flex items-center gap-1"><BedDouble size={12} /> {o.habitaciones} hab</span>
                    <span className="flex items-center gap-1"><Bath size={12} /> {o.banos} baño{o.banos > 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    Alquiler est. {fmtEur(o.estimacion_alquiler)}/mes · Neta {o.rentabilidad_neta}% · {o.anio_construccion}
                  </div>
                  {o.pm2_zona && (
                    <div className="text-xs text-gray-400">
                      {o.pm2_propiedad} €/m² (zona: {o.pm2_zona} €/m²{o.fuente_precios === 'fotocasa' ? ', Fotocasa' : ''})
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-3">{error}</p>}
        </div>
      ) : (
        <div>
          <button onClick={() => !creando && setSel(null)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-3">
            <ArrowLeft size={14} /> Volver a las opciones
          </button>

          <div className="border border-violet-200 bg-violet-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-gray-900">{sel.poblacion} ({sel.provincia})</span>
              <span className="font-bold text-gray-900">{fmtEur(sel.precio)}</span>
            </div>
            <div className="text-sm text-gray-600">
              {sel.m2} m² · {sel.habitaciones} hab · {sel.banos} baño{sel.banos > 1 ? 's' : ''} · planta {sel.planta}ª · {sel.anio_construccion}
              <br />Rentabilidad {sel.rentabilidad_bruta}% bruta / {sel.rentabilidad_neta}% neta · Alquiler est. {fmtEur(sel.estimacion_alquiler)}/mes
            </div>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-1">Imágenes base ({imagenesBase.length}/{MAX_BASES})</label>
          <p className="text-xs text-gray-500 mb-2">
            Sube hasta {MAX_BASES} fotos reales de referencia (salón, cocina, un dormitorio...): todas las estancias
            se generarán con GPT Image 2 imitando su estilo, época y estado.
          </p>

          <div
            className={`flex flex-wrap gap-2 mb-3 rounded-xl transition-colors ${dragOver ? 'bg-violet-50 outline-dashed outline-2 outline-violet-400 p-2' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {imagenesBase.map(url => (
              <div key={url} className="relative group">
                <img src={url} alt="" className="w-28 h-28 rounded-lg object-cover" />
                <button type="button" onClick={() => !creando && setImagenesBase(prev => prev.filter(u => u !== url))}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X size={10} />
                </button>
              </div>
            ))}
            {imagenesBase.length < MAX_BASES && (
              <label className={`w-28 h-28 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition-colors ${subiendo || creando ? 'opacity-50 pointer-events-none' : ''}`}>
                {subiendo ? <Loader2 size={18} className="text-gray-400 animate-spin" /> : <ImagePlus size={18} className="text-gray-400" />}
                <span className="text-xs text-gray-400 mt-1 text-center px-1">{subiendo ? 'Subiendo...' : 'Añadir o arrastrar'}</span>
                <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUploadBase} />
              </label>
            )}
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3">{error}</p>}

          <button onClick={handleCrear} disabled={!imagenesBase.length || creando}
            className="w-full py-2.5 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {creando ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {creando ? `Creando propiedad y generando ${numFotos} fotos (1-3 min, no cierres)...` : `Crear propiedad + ${numFotos} fotos IA`}
          </button>
        </div>
      )}
    </Modal>
  );
}
