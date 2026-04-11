import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Users, Building2, ClipboardList, Briefcase, CornerDownLeft,
  Loader2,
} from 'lucide-react';
import {
  inversoresApi, propiedadesApi, peticionesApi, proveedoresApi,
} from '../api';

// ─── Normalización para búsqueda (minúsculas, sin tildes) ──────────────────
function norm(s) {
  return (s || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function fmtEUR(n) {
  if (!n) return '';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n);
}

// Construye un array plano de entradas indexables desde las entidades
function buildIndex({ inversores, propiedades, peticiones, proveedores }) {
  const items = [];

  for (const i of inversores || []) {
    const nombre = [i.nombre, i.apellidos].filter(Boolean).join(' ');
    items.push({
      kind: 'inversor',
      id: i.id,
      title: nombre || 'Inversor sin nombre',
      subtitle: [i.empresa, i.email, i.telefono].filter(Boolean).join(' · '),
      tags: i.tags || [],
      haystack: norm(
        [nombre, i.email, i.telefono, i.empresa, (i.tags || []).join(' ')].join(' ')
      ),
      path: `/inversores/${i.id}`,
      icon: Users,
    });
  }

  for (const p of propiedades || []) {
    const titulo = [
      p.tipo,
      p.direccion || p.poblacion || p.zona,
    ].filter(Boolean).join(' · ');
    const specs = [
      p.m2 && `${p.m2} m²`,
      p.habitaciones && `${p.habitaciones} hab`,
      p.banos && `${p.banos} baños`,
    ].filter(Boolean).join(' · ');
    const sub = [fmtEUR(p.precio), specs, p.provincia].filter(Boolean).join(' · ');
    items.push({
      kind: 'propiedad',
      id: p.id,
      title: titulo || 'Propiedad',
      subtitle: sub,
      tags: p.tags || [],
      haystack: norm(
        [
          p.tipo, p.zona, p.direccion, p.poblacion, p.provincia,
          p.descripcion, p.ref_catastral, (p.tags || []).join(' '),
          p.proveedores?.nombre,
        ].join(' ')
      ),
      path: `/propiedades/${p.id}`,
      icon: Building2,
    });
  }

  for (const q of peticiones || []) {
    const inv = q.inversores;
    const nombreInv = inv
      ? [inv.nombre, inv.apellidos].filter(Boolean).join(' ')
      : 'Sin inversor';
    const rango = [fmtEUR(q.precio_min), fmtEUR(q.precio_max)].filter(Boolean).join(' – ');
    items.push({
      kind: 'peticion',
      id: q.id,
      title: `Petición de ${nombreInv}`,
      subtitle: [
        (q.tipos_propiedad || []).join(', '),
        q.provincia || q.zona,
        rango,
      ].filter(Boolean).join(' · '),
      tags: [],
      haystack: norm(
        [
          nombreInv, (q.tipos_propiedad || []).join(' '),
          q.provincia, q.poblacion, q.zona, q.notas,
        ].join(' ')
      ),
      path: inv ? `/inversores/${inv.id}` : '/peticiones',
      icon: ClipboardList,
    });
  }

  for (const v of proveedores || []) {
    items.push({
      kind: 'proveedor',
      id: v.id,
      title: v.nombre || 'Proveedor',
      subtitle: [v.tipo, v.empresa, v.email, v.telefono].filter(Boolean).join(' · '),
      tags: [],
      haystack: norm(
        [v.nombre, v.email, v.telefono, v.empresa, v.notas].join(' ')
      ),
      path: '/proveedores',
      icon: Briefcase,
    });
  }

  return items;
}

const KIND_LABEL = {
  inversor: 'Inversor',
  propiedad: 'Propiedad',
  peticion: 'Petición',
  proveedor: 'Proveedor',
};

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [index, setIndex] = useState([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  // Abrir con Cmd/Ctrl+K, cerrar con Escape
  useEffect(() => {
    const onKey = (e) => {
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Cargar datos cuando se abre la primera vez (y refrescar al reabrir)
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      inversoresApi.getAll().catch(() => []),
      propiedadesApi.getAll().catch(() => []),
      peticionesApi.getAll().catch(() => []),
      proveedoresApi.getAll().catch(() => []),
    ])
      .then(([inversores, propiedades, peticiones, proveedores]) => {
        setIndex(buildIndex({ inversores, propiedades, peticiones, proveedores }));
      })
      .finally(() => setLoading(false));
  }, [open]);

  // Enfocar input al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelected(0);
    }
  }, [open]);

  // Filtrar + rankear por número de palabras que coinciden
  const results = useMemo(() => {
    if (!index.length) return [];
    const q = norm(query).trim();
    if (!q) return index.slice(0, 15); // mostrar algunos al abrir, sin filtrar
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = [];
    for (const it of index) {
      let score = 0;
      for (const t of terms) {
        if (it.haystack.includes(t)) score += 1;
      }
      if (score === terms.length) {
        // bonus si empieza por el término exacto
        if (norm(it.title).startsWith(q)) score += 2;
        scored.push({ ...it, score });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 30);
  }, [index, query]);

  // Navegación con teclado
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((s) => Math.min(s + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((s) => Math.max(s - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = results[selected];
        if (item) go(item);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, results, selected]);

  // Mantener el item seleccionado visible
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selected}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const go = (item) => {
    setOpen(false);
    navigate(item.path);
  };

  return (
    <>
      {/* Botón lanzador en la topbar */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:inline-flex items-center gap-2 text-xs text-gray-500 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-lg px-2.5 py-1.5 transition-colors"
        aria-label="Búsqueda global"
      >
        <Search size={13} />
        <span>Buscar…</span>
        <kbd className="ml-1 text-[10px] bg-white border border-gray-200 rounded px-1 py-0.5 font-sans text-gray-500">
          ⌘K
        </kbd>
      </button>
      {/* Versión móvil: solo icono */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden p-2 text-gray-600 hover:text-gray-900"
        aria-label="Búsqueda global"
      >
        <Search size={18} />
      </button>

      {!open ? null : (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-20 sm:pt-28 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-xl bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
              <Search size={18} className="text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelected(0);
                }}
                placeholder="Buscar inversores, propiedades, peticiones, proveedores…"
                className="flex-1 bg-transparent outline-none text-sm text-gray-800 placeholder:text-gray-400"
              />
              {loading && <Loader2 size={14} className="text-gray-400 animate-spin" />}
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Resultados */}
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto">
              {!loading && results.length === 0 && (
                <div className="text-center py-10 text-sm text-gray-400">
                  {query ? 'Sin resultados' : 'Escribe para empezar a buscar…'}
                </div>
              )}
              {results.map((item, i) => {
                const Icon = item.icon;
                const isSel = i === selected;
                return (
                  <button
                    key={`${item.kind}-${item.id}`}
                    data-idx={i}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => go(item)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                      isSel ? 'bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSel ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'
                    }`}>
                      <Icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate capitalize">
                          {item.title}
                        </span>
                        <span className="text-[10px] uppercase font-medium text-gray-400 tracking-wide">
                          {KIND_LABEL[item.kind]}
                        </span>
                      </div>
                      {item.subtitle && (
                        <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
                      )}
                    </div>
                    {isSel && (
                      <CornerDownLeft size={13} className="text-blue-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Footer con hints */}
            <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-400">
              <span className="flex items-center gap-2">
                <kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-sans">↑↓</kbd>
                navegar
                <kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-sans">↵</kbd>
                abrir
                <kbd className="bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5 font-sans">esc</kbd>
                cerrar
              </span>
              <span>{results.length} resultados</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
