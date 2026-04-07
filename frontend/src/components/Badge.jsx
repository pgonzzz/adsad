const styles = {
  // Peticiones
  activa: 'bg-green-100 text-green-800',
  pausada: 'bg-yellow-100 text-yellow-800',
  cerrada: 'bg-gray-100 text-gray-600',
  // Propiedades
  disponible: 'bg-blue-100 text-blue-800',
  en_negociacion: 'bg-orange-100 text-orange-800',
  vendida: 'bg-gray-100 text-gray-600',
  // Matches
  sugerido: 'bg-purple-100 text-purple-800',
  enviado: 'bg-sky-100 text-sky-800',
  negociando: 'bg-orange-100 text-orange-800',
  cerrado: 'bg-green-100 text-green-800',
  descartado: 'bg-red-100 text-red-700',
  // Operaciones
  en_curso: 'bg-blue-100 text-blue-800',
  firmada: 'bg-green-100 text-green-800',
  caida: 'bg-red-100 text-red-700',
  // Proveedores
  inmobiliaria: 'bg-indigo-100 text-indigo-800',
  propietario: 'bg-teal-100 text-teal-800',
};

const labels = {
  activa: 'Activa',
  pausada: 'Pausada',
  cerrada: 'Cerrada',
  disponible: 'Disponible',
  en_negociacion: 'En negociación',
  vendida: 'Vendida',
  sugerido: 'Sugerido',
  enviado: 'Enviado',
  negociando: 'Negociando',
  cerrado: 'Cerrado',
  descartado: 'Descartado',
  en_curso: 'En curso',
  firmada: 'Firmada',
  caida: 'Caída',
  inmobiliaria: 'Inmobiliaria',
  propietario: 'Propietario',
};

export default function Badge({ value }) {
  const cls = styles[value] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {labels[value] || value}
    </span>
  );
}
