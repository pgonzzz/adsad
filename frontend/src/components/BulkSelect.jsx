import { useState, useEffect, useCallback, useMemo } from 'react';
import { Trash2, X } from 'lucide-react';

/**
 * Selección múltiple de filas para acciones en bloque.
 *
 * Uso:
 *   const bulk = useBulkSelect(filtered.map(x => x.id));
 *   <SelectAllCheckbox bulk={bulk} />   // en la cabecera
 *   <RowCheckbox bulk={bulk} id={x.id} /> // en cada fila
 *   <BulkBar count={bulk.count} onDelete={...} onClear={bulk.clear} />
 *
 * La selección se limpia sola de los ids que dejan de estar en la lista
 * (p.ej. tras borrar o cambiar de filtro), así nunca se borra algo que no
 * se está viendo.
 */
export function useBulkSelect(ids) {
  const [selected, setSelected] = useState(() => new Set());
  const key = ids.join('|');
  const idSet = useMemo(() => new Set(ids), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelected(prev => {
      const next = new Set([...prev].filter(id => idSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [idSet]);

  const toggle = useCallback((id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const allSelected = ids.length > 0 && ids.every(id => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(ids));
  }, [allSelected, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(() => setSelected(new Set()), []);

  return {
    selected,
    count: selected.size,
    isSelected: (id) => selected.has(id),
    toggle,
    toggleAll,
    allSelected,
    clear,
  };
}

const stop = (e) => e.stopPropagation();

export function SelectAllCheckbox({ bulk, title = 'Seleccionar todo lo visible' }) {
  return (
    <input
      type="checkbox"
      checked={bulk.allSelected}
      onChange={bulk.toggleAll}
      onClick={stop}
      title={title}
      className="w-4 h-4 cursor-pointer accent-blue-600"
    />
  );
}

export function RowCheckbox({ bulk, id }) {
  return (
    <input
      type="checkbox"
      checked={bulk.isSelected(id)}
      onChange={() => bulk.toggle(id)}
      onClick={stop}
      className="w-4 h-4 cursor-pointer accent-blue-600"
    />
  );
}

/** Barra que aparece cuando hay filas seleccionadas. */
export function BulkBar({ count, onDelete, onClear, singular = 'elemento', plural = 'elementos', busy = false }) {
  if (!count) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-200 text-sm">
      <span className="font-medium text-blue-800">
        {count} {count === 1 ? singular : plural} seleccionado{count === 1 ? '' : 's'}
      </span>
      <div className="flex-1" />
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 hover:text-gray-900 rounded-lg hover:bg-white"
      >
        <X size={13} /> Quitar selección
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
      >
        <Trash2 size={13} /> Eliminar seleccionados
      </button>
    </div>
  );
}
