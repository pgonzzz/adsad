import { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';

/**
 * Input de etiquetas libres (chips) reutilizable.
 *
 * Muestra cada tag como un chip con botón de borrar y un input
 * para añadir nuevos. Se añade al pulsar Enter, coma o espacio.
 * Los tags se normalizan: minúsculas, sin espacios al borde y sin "#".
 *
 * Props:
 *   value     : array de strings (los tags actuales)
 *   onChange  : (nuevaLista) => void
 *   suggestions: array opcional de tags existentes para sugerir
 *   placeholder: texto del input vacío
 *   size      : 'sm' | 'md' (default 'md')
 */
export default function TagsInput({
  value = [],
  onChange,
  suggestions = [],
  placeholder = 'Añadir etiqueta…',
  size = 'md',
}) {
  const [input, setInput] = useState('');
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);

  const tags = Array.isArray(value) ? value : [];

  const normalize = (t) =>
    t.trim()
      .toLowerCase()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-');

  const addTag = (raw) => {
    const t = normalize(raw);
    if (!t) return;
    if (tags.includes(t)) return;
    onChange([...tags, t]);
    setInput('');
  };

  const removeTag = (t) => {
    onChange(tags.filter((x) => x !== t));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      if (input.trim()) addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      // Borra el último tag cuando el input está vacío
      removeTag(tags[tags.length - 1]);
    }
  };

  // Sugerencias que no están ya añadidas y que coinciden con lo escrito
  const filteredSuggestions = suggestions
    .filter((s) => !tags.includes(s))
    .filter((s) => !input || s.includes(normalize(input)))
    .slice(0, 6);

  const chipSize = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  const boxSize = size === 'sm' ? 'px-2 py-1.5' : 'px-3 py-2';

  return (
    <div className="relative">
      <div
        className={`flex flex-wrap items-center gap-1.5 border border-gray-300 rounded-lg ${boxSize} focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent cursor-text`}
        onClick={() => inputRef.current?.focus()}
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className={`inline-flex items-center gap-1 ${chipSize} bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-medium`}
          >
            <span>#{tag}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="text-blue-400 hover:text-blue-700"
              aria-label={`Quitar ${tag}`}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            // Al salir, si hay algo escrito, convertirlo en tag
            if (input.trim()) addTag(input);
            setTimeout(() => setFocused(false), 150);
          }}
          onFocus={() => setFocused(true)}
          placeholder={tags.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[80px] text-sm bg-transparent outline-none placeholder:text-gray-400"
        />
      </div>

      {/* Sugerencias */}
      {focused && filteredSuggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
          {filteredSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(s);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-600 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-1"
            >
              <Plus size={10} /> #{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Chips de solo lectura para mostrar tags en tablas/fichas.
 */
export function TagsDisplay({ tags = [], size = 'sm', max }) {
  if (!tags || tags.length === 0) return null;
  const shown = max ? tags.slice(0, max) : tags;
  const hidden = max ? tags.length - max : 0;
  const cls = size === 'sm' ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((t) => (
        <span
          key={t}
          className={`${cls} bg-blue-50 text-blue-700 border border-blue-200 rounded-full font-medium`}
        >
          #{t}
        </span>
      ))}
      {hidden > 0 && (
        <span className={`${cls} bg-gray-100 text-gray-500 rounded-full`}>+{hidden}</span>
      )}
    </div>
  );
}
