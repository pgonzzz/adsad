import { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

const ToastContext = createContext(null);

/**
 * Hook para lanzar toasts desde cualquier componente.
 *
 *   const toast = useToast();
 *   toast.success('Propiedad creada');
 *   toast.error('Error al guardar');
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast requiere <ToastProvider>');
  return ctx;
}

/**
 * Provider que monta la zona de toasts (esquina superior derecha).
 * Envuelve <Layout> o el root de la app.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((msg, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 3000);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const value = {
    success: (msg) => add(msg, 'success'),
    error: (msg) => add(msg, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      {/* Contenedor flotante */}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center gap-2.5 pl-3.5 pr-2 py-2.5 rounded-lg shadow-lg text-sm font-medium animate-slide-in ${
                t.type === 'success'
                  ? 'bg-green-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
            >
              {t.type === 'success' ? (
                <CheckCircle2 size={16} className="shrink-0" />
              ) : (
                <AlertCircle size={16} className="shrink-0" />
              )}
              <span className="flex-1">{t.msg}</span>
              <button
                onClick={() => dismiss(t.id)}
                className="p-0.5 hover:bg-white/20 rounded"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
