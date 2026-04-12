import { useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Lightbox con navegación por flechas (clic + teclado).
 *
 * Props:
 *   images   : string[] — array de URLs
 *   index    : number — índice de la imagen activa (o null para cerrar)
 *   onClose  : () => void
 *   onChange : (newIndex) => void
 */
export default function Lightbox({ images = [], index, onClose, onChange }) {
  const isOpen = index !== null && index !== undefined && images.length > 0;

  const goPrev = useCallback(() => {
    if (index > 0) onChange(index - 1);
  }, [index, onChange]);

  const goNext = useCallback(() => {
    if (index < images.length - 1) onChange(index + 1);
  }, [index, images.length, onChange]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose, goPrev, goNext]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Imagen */}
      <img
        src={images[index]}
        alt=""
        className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl select-none"
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />

      {/* Cerrar */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
      >
        <X size={28} />
      </button>

      {/* Contador */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm bg-black/50 px-3 py-1 rounded-full">
        {index + 1} / {images.length}
      </div>

      {/* Flecha izquierda */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Flecha derecha */}
      {index < images.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/60 hover:text-white transition-colors"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}
