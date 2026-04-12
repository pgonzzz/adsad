import Combobox, { ComboboxMunicipios } from './Combobox';
import TagsInput from './TagsInput';
import { PROVINCIAS } from '../data/municipios';

const TIPOS = ['piso', 'local', 'nave', 'edificio', 'solar', 'otro'];
const ESTADOS = ['disponible', 'reservada', 'en_negociacion', 'vendida'];

/**
 * Campos editables de una propiedad (sin fotos ni adjuntos — esos los
 * gestiona cada página por separado). Se usa tanto en el modal de la
 * lista como en el modal de edición in-situ de la ficha.
 *
 * Props:
 *   form         : estado del form (objeto plano)
 *   setForm      : setter del form (React setState con callback)
 *   proveedores  : array de proveedores para el <select>
 *   existingTags : array de strings para sugerencias del TagsInput
 */
/** Auto-calcula rentabilidad bruta cuando hay precio + estimación alquiler */
function autoCalcRent(form) {
  const precio = Number(form.precio);
  const alquiler = Number(form.estimacion_alquiler);
  if (precio > 0 && alquiler > 0) {
    form.rentabilidad_bruta = ((alquiler * 12) / precio * 100).toFixed(1);
  }
  return form;
}

export default function PropiedadFormFields({
  form,
  setForm,
  proveedores = [],
  existingTags = [],
}) {
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
          <select
            required
            value={form.tipo}
            onChange={set('tipo')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
          <select
            value={form.estado}
            onChange={set('estado')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
          <Combobox
            options={PROVINCIAS}
            value={form.provincia}
            onChange={(v) => setForm((f) => ({ ...f, provincia: v, poblacion: '' }))}
            placeholder="Selecciona provincia"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Población</label>
          <ComboboxMunicipios
            provincia={form.provincia}
            value={form.poblacion}
            onChange={(v) => setForm((f) => ({ ...f, poblacion: v }))}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Dirección (calle y número)
        </label>
        <input
          type="text"
          value={form.direccion || ''}
          onChange={set('direccion')}
          placeholder="Ej: Calle Mayor 24"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-gray-400 mt-1">
          Si la rellenas, verás un mapa en la ficha de la propiedad.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Precio (€)</label>
          <input
            type="number"
            value={form.precio}
            onChange={(e) => {
              const precio = e.target.value;
              setForm((f) => {
                const updated = { ...f, precio };
                return autoCalcRent(updated);
              });
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estimación alquiler (€/mes)</label>
          <input
            type="number"
            value={form.estimacion_alquiler || ''}
            onChange={(e) => {
              const estimacion_alquiler = e.target.value;
              setForm((f) => {
                const updated = { ...f, estimacion_alquiler };
                return autoCalcRent(updated);
              });
            }}
            placeholder="Ej: 800"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rent. bruta (%)
            {form.precio && form.estimacion_alquiler && (
              <span className="text-xs text-blue-500 font-normal ml-1">auto-calculada</span>
            )}
          </label>
          <input
            type="number"
            step="0.1"
            value={form.rentabilidad_bruta}
            onChange={set('rentabilidad_bruta')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Rent. neta (%)</label>
          <input
            type="number"
            step="0.1"
            value={form.rentabilidad_neta}
            onChange={set('rentabilidad_neta')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">m²</label>
          <input
            type="number"
            value={form.m2 || ''}
            onChange={set('m2')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Habs.</label>
          <input
            type="number"
            value={form.habitaciones || ''}
            onChange={set('habitaciones')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Baños</label>
          <input
            type="number"
            value={form.banos || ''}
            onChange={set('banos')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Planta</label>
          <input
            type="text"
            value={form.planta || ''}
            onChange={set('planta')}
            placeholder="3ª ext."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Año construcción</label>
          <input
            type="number"
            value={form.anio_construccion || ''}
            onChange={set('anio_construccion')}
            placeholder="1975"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Referencia catastral</label>
          <input
            type="text"
            value={form.ref_catastral || ''}
            onChange={set('ref_catastral')}
            placeholder="9872023VH5697S0001WX"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Etiquetas</label>
        <TagsInput
          value={form.tags || []}
          onChange={(tags) => setForm((f) => ({ ...f, tags }))}
          suggestions={existingTags}
          placeholder="Ej: reformada, inversor, exterior… (enter)"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
        <select
          value={form.proveedor_id || ''}
          onChange={set('proveedor_id')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Sin proveedor</option>
          {proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre} ({p.tipo})
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
        <textarea
          rows={2}
          value={form.descripcion || ''}
          onChange={set('descripcion')}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={!!form.acepta_financiacion}
          onChange={(e) => setForm((f) => ({ ...f, acepta_financiacion: e.target.checked }))}
        />
        <span className="text-sm text-gray-700">Acepta financiación</span>
      </label>
    </div>
  );
}

/**
 * Normaliza el objeto form al payload que espera la API:
 * convierte strings vacíos a null, parsea números y limpia IDs.
 */
export function propiedadFormToPayload(form) {
  return {
    tipo: form.tipo,
    estado: form.estado,
    provincia: form.provincia || null,
    poblacion: form.poblacion || null,
    direccion: form.direccion || null,
    precio: form.precio ? Number(form.precio) : null,
    estimacion_alquiler: form.estimacion_alquiler ? Number(form.estimacion_alquiler) : null,
    rentabilidad_bruta: form.rentabilidad_bruta ? Number(form.rentabilidad_bruta) : null,
    rentabilidad_neta: form.rentabilidad_neta ? Number(form.rentabilidad_neta) : null,
    m2: form.m2 ? Number(form.m2) : null,
    habitaciones: form.habitaciones ? parseInt(form.habitaciones, 10) : null,
    banos: form.banos ? parseInt(form.banos, 10) : null,
    planta: form.planta || null,
    anio_construccion: form.anio_construccion ? parseInt(form.anio_construccion, 10) : null,
    ref_catastral: form.ref_catastral || null,
    tags: form.tags || [],
    proveedor_id: form.proveedor_id || null,
    descripcion: form.descripcion || null,
    acepta_financiacion: !!form.acepta_financiacion,
  };
}

/**
 * Carga un objeto propiedad (devuelto por la API) en el formato que
 * espera el formulario (strings para los inputs, arrays por defecto).
 */
export function propiedadToForm(p) {
  return {
    tipo: p.tipo || 'piso',
    estado: p.estado || 'disponible',
    provincia: p.provincia || '',
    poblacion: p.poblacion || '',
    direccion: p.direccion || '',
    precio: p.precio ?? '',
    estimacion_alquiler: p.estimacion_alquiler ?? '',
    rentabilidad_bruta: p.rentabilidad_bruta ?? '',
    rentabilidad_neta: p.rentabilidad_neta ?? '',
    m2: p.m2 ?? '',
    habitaciones: p.habitaciones ?? '',
    banos: p.banos ?? '',
    planta: p.planta || '',
    anio_construccion: p.anio_construccion ?? '',
    ref_catastral: p.ref_catastral || '',
    tags: p.tags || [],
    proveedor_id: p.proveedor_id || '',
    descripcion: p.descripcion || '',
    acepta_financiacion: !!p.acepta_financiacion,
  };
}
