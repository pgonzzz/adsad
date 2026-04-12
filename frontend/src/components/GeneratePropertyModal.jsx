import { useState, useRef } from 'react';
import { Sparkles, Upload, Loader2, ImagePlus, X } from 'lucide-react';
import Modal from './Modal';
import { propiedadesApi } from '../api';
import { useToast } from './Toast';

const STEPS = [
  'Subiendo foto de referencia…',
  'Analizando el estilo del piso…',
  'Generando datos realistas…',
  'Generando fotos con IA (puede tardar 30-60s)…',
  'Creando propiedad en el CRM…',
];

/**
 * Modal para generar una propiedad ficticia con IA.
 *
 * Flujo:
 * 1. El usuario sube una foto de referencia de un piso real
 * 2. El backend la analiza con GPT-4o, genera datos y 7 fotos con DALL-E
 * 3. Se crea la propiedad completa y se redirige a su ficha
 *
 * Props:
 *   isOpen      : boolean
 *   onClose     : () => void
 *   onCreated   : (propiedad) => void — callback al crear, p.ej. para navegar
 */
export default function GeneratePropertyModal({ isOpen, onClose, onCreated }) {
  const toast = useToast();
  const fileRef = useRef();
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(f);
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleGenerate = async () => {
    setLoading(true);
    setStep(0);

    try {
      // Convertir foto a base64 data URL (se envía directo al backend,
      // sin pasar por Supabase storage — evita problemas de RLS)
      let referenceDataUrl = null;
      if (file) {
        setStep(0);
        referenceDataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(file);
        });
      }

      // El backend hace todo: analizar, generar datos, generar fotos, crear propiedad
      setStep(1);
      const progressInterval = setInterval(() => {
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
      }, 12000);

      const propiedad = await propiedadesApi.generate({
        reference_image_data: referenceDataUrl,
      });

      clearInterval(progressInterval);
      setStep(STEPS.length - 1);

      toast.success('Propiedad ficticia generada con IA');
      onCreated?.(propiedad);
      onClose();
    } catch (err) {
      toast.error('Error generando: ' + err.message);
    } finally {
      setLoading(false);
      setStep(0);
    }
  };

  const handleClose = () => {
    if (loading) return; // no cerrar mientras genera
    clearFile();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Generar propiedad ficticia con IA" size="md">
      <div className="space-y-5">
        {/* Explicación */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          <strong>Fake it until you make it.</strong> Sube una foto de un piso real como referencia.
          La IA generará 7 fotos (salón, cocina, 3 habs, 2 baños) y datos realistas para una zona
          periférica de una gran ciudad española. La propiedad se creará lista para publicar.
        </div>

        {/* Upload de foto de referencia */}
        {!loading && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Foto de referencia (opcional, pero recomendado)
            </label>
            {preview ? (
              <div className="relative inline-block">
                <img
                  src={preview}
                  alt="Referencia"
                  className="w-full max-w-xs h-48 object-cover rounded-lg border border-gray-200"
                />
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                >
                  <X size={12} />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                <ImagePlus size={28} className="text-gray-400 mb-2" />
                <span className="text-sm text-gray-500">Sube una foto de un piso real</span>
                <span className="text-xs text-gray-400 mt-1">La IA se inspirará en el estilo</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFile}
                />
              </label>
            )}
          </div>
        )}

        {/* Loading / Progreso */}
        {loading && (
          <div className="py-8">
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={32} className="text-blue-500 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">{STEPS[step]}</p>
                <p className="text-xs text-gray-400 mt-1">No cierres esta ventana</p>
              </div>
              {/* Barra de progreso */}
              <div className="w-full max-w-xs bg-gray-100 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-1000"
                  style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                />
              </div>
              <p className="text-xs text-gray-400">
                Paso {step + 1} de {STEPS.length}
              </p>
            </div>
          </div>
        )}

        {/* Botones */}
        {!loading && (
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium shadow-sm"
            >
              <Sparkles size={14} /> Generar con IA
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
