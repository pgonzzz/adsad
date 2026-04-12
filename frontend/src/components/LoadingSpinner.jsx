import { Loader2 } from 'lucide-react';

/**
 * Spinner de carga consistente para usar en todas las páginas.
 *
 * Props:
 *   text     : string (default 'Cargando…')
 *   fullPage : boolean — si true, centra vertical y horizontalmente
 */
export default function LoadingSpinner({ text = 'Cargando…', fullPage = false }) {
  const inner = (
    <div className="flex items-center justify-center gap-2 py-10">
      <Loader2 size={18} className="text-blue-500 animate-spin" />
      <span className="text-sm text-gray-400">{text}</span>
    </div>
  );
  if (fullPage) {
    return <div className="flex-1 flex items-center justify-center">{inner}</div>;
  }
  return inner;
}
