import { useEffect, useState } from 'react';
import { contratosApi } from '../api';

// Devuelve true si el usuario actual tiene acceso al módulo de Contratos.
// Se usa para pintar (o no) la entrada del sidebar y la sección en las fichas.
// El backend es quien realmente enforce el permiso; esto es sólo UX.
export default function useContratosAccess() {
  const [hasAccess, setHasAccess] = useState(null); // null = cargando

  useEffect(() => {
    let cancelled = false;
    contratosApi.checkAccess().then(ok => {
      if (!cancelled) setHasAccess(!!ok);
    });
    return () => { cancelled = true; };
  }, []);

  return hasAccess;
}
