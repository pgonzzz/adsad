import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X } from 'lucide-react';

export default function Combobox({ options = [], value, onChange, placeholder = 'Buscar...', disabled = false }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Cuando cambia el valor externo, sincroniza el texto
  useEffect(() => {
    if (!open) setQuery(value || '');
  }, [value, open]);

  const filtered = query.length === 0
    ? options.slice(0, 50)
    : options.filter(o => o.toLowerCase().includes(query.toLowerCase())).slice(0, 50);

  const handleSelect = (option) => {
    onChange(option);
    setQuery(option);
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  return (
    <div className="relative" ref={ref}>
      <div className={`flex items-center border rounded-lg px-3 py-2 bg-white ${disabled ? 'bg-gray-50 opacity-60 cursor-not-allowed' : 'border-gray-300'} focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500`}>
        <input
          type="text"
          value={open ? query : (value || '')}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setQuery(''); setOpen(true); }}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 text-sm bg-transparent outline-none min-w-0"
        />
        {value && !disabled && (
          <button type="button" onClick={handleClear} className="text-gray-400 hover:text-gray-600 mr-1">
            <X size={14} />
          </button>
        )}
        <ChevronDown size={14} className={`text-gray-400 transition-transform shrink-0 ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && filtered.length > 0 && (
        <ul className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map(option => (
            <li
              key={option}
              onMouseDown={() => handleSelect(option)}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 hover:text-blue-700 ${value === option ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
            >
              {option}
            </li>
          ))}
        </ul>
      )}

      {open && filtered.length === 0 && query.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-400">
          Sin resultados para "{query}"
        </div>
      )}
    </div>
  );
}
