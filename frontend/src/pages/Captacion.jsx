import { useState, useEffect, useCallback } from 'react';
import { captacionApi } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import Combobox, { ComboboxMunicipios } from '../components/Combobox';
import { PROVINCIAS } from '../data/municipios';
import {
  Plus, Search, Wifi, WifiOff, RefreshCw, ChevronLeft,
  Play, Pause, Pencil, Trash2, MessageSquare, ExternalLink,
  LayoutGrid, List, Smartphone, UserPlus,
} from 'lucide-react';
import { proveedoresApi } from '../api';

// ─── Constantes ───────────────────────────────────────────────────────────────
const PORTALES = ['idealista', 'fotocasa', 'habitaclia'];
const TIPOS = ['piso', 'casa', 'local', 'nave', 'solar', 'edificio', 'otro'];

const ESTADO_CAMPANA_COLORS = {
  borrador: 'gray',
  activa: 'green',
  pausada: 'yellow',
  completada: 'blue',
};

const ESTADO_LEAD_COLORS = {
  nuevo: 'blue',
  enviado: 'yellow',
  respondido: 'green',
  descartado: 'red',
  convertido: 'purple',
};

const ESTADO_LEAD_LABELS = {
  nuevo: 'Nuevo',
  enviado: 'Enviado',
  respondido: 'Respondido',
  descartado: 'Descartado',
  convertido: 'Convertido',
};

const emptyCampana = {
  nombre: '',
  portal: 'idealista',
  url_inicial: '',
  provincia: '',
  poblacion: '',
  tipo: 'piso',
  precio_min: '',
  precio_max: '',
  max_paginas: 3,
  plantilla_mensaje: 'Hola {{nombre}}, te contacto en relación a tu anuncio de {{tipo}} en {{poblacion}} por {{precio}}. ¿Sigues teniendo disponible el inmueble?',
  plantilla_followup: 'Hola {{nombre}}, hace unos días te escribí por tu anuncio de {{tipo}} en {{poblacion}}. ¿Pudiste verlo?',
  dias_followup: 3,
  // Automatización
  scrape_auto: false,
  scrape_intervalo_horas: 24,
  wa_auto_enviar: false,
  followup_auto: false,
};

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

// Convierte un slug de Idealista ("a-coruna", "vilanova-i-la-geltru") en
// nombre legible ("A Coruña", "Vilanova I La Geltru"). No es perfecto
// (no recupera tildes), pero sirve como auto-relleno orientativo.
function slugToTitle(slug) {
  if (!slug) return '';
  return slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Intenta extraer provincia y población de una URL de Idealista.
// Ejemplo: https://www.idealista.com/venta-viviendas/granollers-barcelona/
//          → { poblacion: 'Granollers', provincia: 'Barcelona' }
// Ejemplo: https://www.idealista.com/venta-viviendas/barcelona-provincia/
//          → { poblacion: '', provincia: 'Barcelona' }
function extractFromIdealistaUrl(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    if (!u.hostname.includes('idealista.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    // Buscar el segmento con la localidad (tras venta-* o alquiler-*)
    const locIdx = parts.findIndex(p => /^(venta|alquiler)-/.test(p));
    const slug = locIdx >= 0 ? parts[locIdx + 1] : parts[1];
    if (!slug) return null;
    const tokens = slug.split('-');
    // Caso "<algo>-provincia" → toda la provincia
    if (tokens[tokens.length - 1] === 'provincia') {
      return { provincia: slugToTitle(tokens.slice(0, -1).join('-')), poblacion: '' };
    }
    // Caso "<municipio>-<provincia>"
    if (tokens.length >= 2) {
      return {
        provincia: slugToTitle(tokens[tokens.length - 1]),
        poblacion: slugToTitle(tokens.slice(0, -1).join('-')),
      };
    }
    // Solo un token: asumimos población
    return { provincia: '', poblacion: slugToTitle(tokens[0]) };
  } catch {
    return null;
  }
}

// ─── Componente AgentStatusBar ────────────────────────────────────────────────
function AgentStatusBar({ status, onRefresh }) {
  const isOnline = status?.online;
  const waConnected = status?.whatsapp_connected;

  let dotClass = 'bg-red-500';
  let label = 'Agente offline';
  if (isOnline && waConnected) { dotClass = 'bg-green-500'; label = 'Agente online · WhatsApp conectado'; }
  else if (isOnline && !waConnected) { dotClass = 'bg-orange-400'; label = 'Agente online · WhatsApp desconectado'; }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`inline-block w-2 h-2 rounded-full ${dotClass} ${isOnline ? 'animate-pulse' : ''}`} />
      <span className="text-gray-600">{label}</span>
      {status?.last_seen && (
        <span className="text-gray-400 text-xs">· {timeAgo(status.last_seen)}</span>
      )}
      <button onClick={onRefresh} className="text-gray-400 hover:text-gray-600 ml-1">
        <RefreshCw size={13} />
      </button>
    </div>
  );
}

// ─── Panel QR ─────────────────────────────────────────────────────────────────
function QRPanel({ qrCode }) {
  if (!qrCode) return null;
  return (
    <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-xl flex items-start gap-4">
      <div className="shrink-0">
        <img src={qrCode} alt="WhatsApp QR" className="w-32 h-32 rounded-lg border border-orange-300" />
      </div>
      <div>
        <p className="font-semibold text-orange-800 mb-1 flex items-center gap-2">
          <Smartphone size={16} /> Vincula WhatsApp
        </p>
        <p className="text-sm text-orange-700">
          Abre WhatsApp en tu móvil, ve a <strong>Dispositivos vinculados</strong> y escanea este QR
          para que el agente pueda enviar mensajes.
        </p>
      </div>
    </div>
  );
}

// ─── Modal de campaña ─────────────────────────────────────────────────────────
function CampanaModal({ open, onClose, editing, onSaved, onSaveAndScrape }) {
  const [form, setForm] = useState(emptyCampana);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(editing ? {
        nombre: editing.nombre || '',
        portal: editing.portal || 'idealista',
        url_inicial: editing.url_inicial || '',
        provincia: editing.provincia || '',
        poblacion: editing.poblacion || '',
        tipo: editing.tipo || 'piso',
        precio_min: editing.precio_min || '',
        precio_max: editing.precio_max || '',
        max_paginas: editing.max_paginas || 3,
        plantilla_mensaje: editing.plantilla_mensaje || emptyCampana.plantilla_mensaje,
        plantilla_followup: editing.plantilla_followup || emptyCampana.plantilla_followup,
        dias_followup: editing.dias_followup || 3,
        scrape_auto: !!editing.scrape_auto,
        scrape_intervalo_horas: editing.scrape_intervalo_horas || 24,
        wa_auto_enviar: !!editing.wa_auto_enviar,
        followup_auto: !!editing.followup_auto,
      } : emptyCampana);
    }
  }, [open, editing]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Al pegar una URL de Idealista, si provincia/población están vacías,
  // auto-rellenarlas parseando el slug de la URL.
  const setUrlInicial = (v) => {
    setForm(f => {
      const next = { ...f, url_inicial: v };
      const extracted = extractFromIdealistaUrl(v);
      if (extracted) {
        if (!f.provincia && extracted.provincia) next.provincia = extracted.provincia;
        if (!f.poblacion && extracted.poblacion) next.poblacion = extracted.poblacion;
      }
      return next;
    });
  };

  const handleSave = async (andScrape = false) => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        precio_min: form.precio_min ? parseInt(form.precio_min) : null,
        precio_max: form.precio_max ? parseInt(form.precio_max) : null,
        max_paginas: parseInt(form.max_paginas) || 3,
        dias_followup: parseInt(form.dias_followup) || 3,
        scrape_intervalo_horas: parseInt(form.scrape_intervalo_horas) || 24,
      };
      let campana;
      if (editing) {
        campana = await captacionApi.updateCampana(editing.id, payload);
      } else {
        campana = await captacionApi.createCampana(payload);
      }
      if (andScrape) {
        onSaveAndScrape(campana);
      } else {
        onSaved(campana);
      }
      onClose();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={editing ? 'Editar campaña' : 'Nueva campaña'}>
      <div className="space-y-4">
        {/* Nombre */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            value={form.nombre}
            onChange={e => set('nombre', e.target.value)}
            placeholder="Ej: Pisos Madrid 200-400k"
          />
        </div>

        {/* Portal */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Portal</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.portal}
            onChange={e => set('portal', e.target.value)}
          >
            {PORTALES.map(p => (
              <option key={p} value={p} disabled={p !== 'idealista'}>
                {p.charAt(0).toUpperCase() + p.slice(1)}{p !== 'idealista' ? ' (próximamente)' : ''}
              </option>
            ))}
          </select>
        </div>

        {/* URL Idealista directa (recomendado) */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <label className="block text-sm font-semibold text-blue-900 mb-1">
            URL de Idealista <span className="text-blue-600 font-normal">(recomendado)</span>
          </label>
          <p className="text-xs text-blue-700 mb-2">
            Abre Idealista en tu navegador, filtra la búsqueda que quieras (ubicación, tipo, precios,
            estado de obra, m², etc.) y pega aquí la URL. Es la forma más fiable: evita que el sistema
            abra una página incorrecta por homónimos de ciudad.
          </p>
          <input
            type="url"
            className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white"
            value={form.url_inicial}
            onChange={e => setUrlInicial(e.target.value)}
            placeholder="https://www.idealista.com/venta-viviendas/valencia-valencia/"
          />
          {form.url_inicial && !form.url_inicial.includes('idealista.com') && (
            <p className="text-xs text-red-600 mt-1">⚠ La URL no parece de idealista.com</p>
          )}
        </div>

        {/* Provincia / Población — opcionales, solo para etiquetar los leads */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Provincia <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <Combobox
              options={PROVINCIAS}
              value={form.provincia}
              onChange={v => { set('provincia', v); set('poblacion', ''); }}
              placeholder="Buscar provincia..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Población <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <ComboboxMunicipios
              provincia={form.provincia}
              value={form.poblacion}
              onChange={v => set('poblacion', v)}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400 -mt-2">
          Estos campos se usan solo como etiquetas de los leads para filtrarlos después. No son necesarios si pegas la URL de Idealista.
        </p>

        {/* Tipo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de activo</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.tipo}
            onChange={e => set('tipo', e.target.value)}
          >
            {TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>

        {/* Precios */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio mín. (€)</label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={form.precio_min}
              onChange={e => set('precio_min', e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio máx. (€)</label>
            <input
              type="number"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={form.precio_max}
              onChange={e => set('precio_max', e.target.value)}
              placeholder="Sin límite"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Máx. páginas</label>
            <input
              type="number"
              min="1"
              max="20"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
              value={form.max_paginas}
              onChange={e => set('max_paginas', e.target.value)}
            />
          </div>
        </div>

        {/* Plantilla mensaje inicial */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Plantilla mensaje inicial
            <span className="ml-2 text-xs text-gray-400 font-normal">
              Variables: {'{{nombre}}'} {'{{precio}}'} {'{{poblacion}}'} {'{{tipo}}'}
            </span>
          </label>
          <textarea
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            value={form.plantilla_mensaje}
            onChange={e => set('plantilla_mensaje', e.target.value)}
          />
        </div>

        {/* Plantilla follow-up */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plantilla follow-up</label>
          <textarea
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            value={form.plantilla_followup}
            onChange={e => set('plantilla_followup', e.target.value)}
          />
        </div>

        {/* Días follow-up */}
        <div className="w-32">
          <label className="block text-sm font-medium text-gray-700 mb-1">Días para follow-up</label>
          <input
            type="number"
            min="1"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.dias_followup}
            onChange={e => set('dias_followup', e.target.value)}
          />
        </div>

        {/* ─── Automatización ─────────────────────────────────────────── */}
        <div className="pt-3 border-t border-gray-100">
          <p className="text-sm font-semibold text-gray-800 mb-1">Automatización</p>
          <p className="text-xs text-gray-500 mb-3">
            Si la campaña está <strong>activa</strong> y tiene alguna de estas opciones encendidas,
            el sistema encolará tareas cada ~10 min sin que tengas que pulsar nada.
            Requiere el agente local encendido y WhatsApp vinculado para los envíos.
          </p>

          {/* Scrape automático */}
          <label className="flex items-start gap-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={!!form.scrape_auto}
              onChange={e => set('scrape_auto', e.target.checked)}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-gray-800">Scrape automático</span>
                {form.scrape_auto && (
                  <div className="flex items-center gap-1 text-xs text-gray-600">
                    cada
                    <input
                      type="number"
                      min="1"
                      max="168"
                      className="w-14 border border-gray-300 rounded px-1.5 py-0.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      value={form.scrape_intervalo_horas}
                      onChange={e => set('scrape_intervalo_horas', e.target.value)}
                      onClick={e => e.stopPropagation()}
                    />
                    horas
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500">Vuelve a scrapear Idealista periódicamente y añade los leads nuevos.</p>
            </div>
          </label>

          {/* WhatsApp inicial automático */}
          <label className="flex items-start gap-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={!!form.wa_auto_enviar}
              onChange={e => set('wa_auto_enviar', e.target.checked)}
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-800">Enviar WhatsApp a nuevos automáticamente</span>
              <p className="text-xs text-gray-500">
                Cuando aparezcan leads nuevos con teléfono móvil válido, el agente los contactará con la plantilla inicial.
              </p>
            </div>
          </label>

          {/* Follow-up automático */}
          <label className="flex items-start gap-3 py-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              checked={!!form.followup_auto}
              onChange={e => set('followup_auto', e.target.checked)}
            />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-800">Follow-up automático</span>
              <p className="text-xs text-gray-500">
                Envía la plantilla de follow-up a los leads enviados hace más de <strong>{form.dias_followup || 3}</strong> días sin respuesta.
              </p>
            </div>
          </label>
        </div>

        {/* Acciones */}
        <div className="flex justify-between pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cancelar
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => handleSave(false)}
              disabled={saving || !form.nombre.trim()}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving || !form.nombre.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              <Search size={14} />
              {saving ? 'Guardando...' : 'Guardar e iniciar scraping'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal edición de lead ────────────────────────────────────────────────────
function LeadEditModal({ open, onClose, lead, onSaved }) {
  const [estado, setEstado] = useState('nuevo');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && lead) {
      setEstado(lead.estado || 'nuevo');
      setNotas(lead.notas || '');
    }
  }, [open, lead]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await captacionApi.updateLead(lead.id, { estado, notas });
      onSaved(updated);
      onClose();
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Editar lead">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={estado}
            onChange={e => setEstado(e.target.value)}
          >
            {Object.entries(ESTADO_LEAD_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            value={notas}
            onChange={e => setNotas(e.target.value)}
            placeholder="Notas sobre este lead..."
          />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: Convertir lead en Proveedor ───────────────────────────────────────
function ConvertirProveedorModal({ lead, onClose, onConverted }) {
  const [form, setForm] = useState({
    tipo: lead?.es_particular === false ? 'inmobiliaria' : 'particular',
    nombre: lead?.nombre_vendedor || '',
    telefono: lead?.telefono || '',
    email: '',
    empresa: '',
    notas: lead?.notas || '',
  });
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await proveedoresApi.create(form);
      await captacionApi.updateLead(lead.id, { estado: 'convertido' });
      onConverted();
      onClose();
    } catch (err) {
      alert('Error al convertir: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <Modal isOpen={!!lead} onClose={onClose} title="Convertir en proveedor">
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
          <UserPlus size={18} className="text-green-600 mt-0.5 shrink-0" />
          <p className="text-sm text-green-800">
            Se creará un nuevo proveedor con estos datos y el lead pasará a estado <strong>Convertido</strong>.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={form.tipo} onChange={set('tipo')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="particular">Particular</option>
              <option value="inmobiliaria">Inmobiliaria</option>
              <option value="promotor">Promotor</option>
              <option value="banco">Banco</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input required value={form.nombre} onChange={set('nombre')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input value={form.telefono} onChange={set('telefono')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={set('email')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Empresa / Agencia</label>
          <input value={form.empresa} onChange={set('empresa')} placeholder="Si aplica"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea rows={2} value={form.notas} onChange={set('notas')}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.nombre}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            <UserPlus size={14} />
            {saving ? 'Convirtiendo...' : 'Crear proveedor'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Tabla de leads ───────────────────────────────────────────────────────────
function LeadsTable({ leads, showCampana = false, onEditLead, onDeleteLead, onRefresh }) {
  const [filterEstado, setFilterEstado] = useState('');
  const [filterProvincia, setFilterProvincia] = useState('');
  const [filterPoblacion, setFilterPoblacion] = useState('');
  const [convertirLead, setConvertirLead] = useState(null);

  const filtered = leads.filter(l => {
    if (filterEstado && l.estado !== filterEstado) return false;
    if (filterProvincia && l.provincia !== filterProvincia) return false;
    if (filterPoblacion && !(l.poblacion || '').toLowerCase().includes(filterPoblacion.toLowerCase())) return false;
    return true;
  });

  const clearFilters = () => {
    setFilterEstado('');
    setFilterProvincia('');
    setFilterPoblacion('');
  };

  const hasFilters = filterEstado || filterProvincia || filterPoblacion;

  return (
    <div>
      {/* Filtros de provincia y población */}
      <div className="flex gap-2 mb-3 items-end flex-wrap">
        <div className="min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Provincia</label>
          <Combobox
            options={PROVINCIAS}
            value={filterProvincia}
            onChange={v => { setFilterProvincia(v); setFilterPoblacion(''); }}
            placeholder="Todas"
          />
        </div>
        <div className="min-w-[180px]">
          <label className="block text-xs text-gray-500 mb-1">Población</label>
          <ComboboxMunicipios
            provincia={filterProvincia}
            value={filterPoblacion}
            onChange={setFilterPoblacion}
            placeholder={filterProvincia ? 'Buscar...' : 'Todas'}
          />
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Filtro de estado */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={() => setFilterEstado('')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            filterEstado === '' ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Todos ({leads.length})
        </button>
        {Object.entries(ESTADO_LEAD_LABELS).map(([k, v]) => {
          const count = leads.filter(l => l.estado === k).length;
          return (
            <button
              key={k}
              onClick={() => setFilterEstado(k)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterEstado === k ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {v} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          {leads.length === 0 ? 'No hay leads aún. Inicia un scraping para obtener leads.' : 'No hay leads con este estado.'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
                <th className="pb-2 pr-3 font-medium">Vendedor</th>
                <th className="pb-2 pr-3 font-medium">Teléfono</th>
                <th className="pb-2 pr-3 font-medium">Tipo</th>
                <th className="pb-2 pr-3 font-medium">Precio</th>
                <th className="pb-2 pr-3 font-medium">Población</th>
                <th className="pb-2 pr-3 font-medium">Estado</th>
                {showCampana && <th className="pb-2 pr-3 font-medium">Campaña</th>}
                <th className="pb-2 pr-3 font-medium">Último contacto</th>
                <th className="pb-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-2 pr-3 font-medium text-gray-800">
                    {lead.nombre_vendedor || '—'}
                    {lead.es_particular === false && (
                      <span className="ml-1 text-xs text-gray-400">(agencia)</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-gray-600 font-mono text-xs">
                    {lead.telefono || '—'}
                  </td>
                  <td className="py-2 pr-3 text-gray-600 capitalize">{lead.tipo || '—'}</td>
                  <td className="py-2 pr-3 text-gray-800">{fmt(lead.precio)}</td>
                  <td className="py-2 pr-3 text-gray-600">{lead.poblacion || lead.provincia || '—'}</td>
                  <td className="py-2 pr-3">
                    <Badge color={ESTADO_LEAD_COLORS[lead.estado] || 'gray'}>
                      {ESTADO_LEAD_LABELS[lead.estado] || lead.estado}
                    </Badge>
                  </td>
                  {showCampana && (
                    <td className="py-2 pr-3 text-gray-500 text-xs">
                      {lead.captacion_campanas?.nombre || '—'}
                    </td>
                  )}
                  <td className="py-2 pr-3 text-gray-400 text-xs">{timeAgo(lead.ultimo_contacto)}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1">
                      {lead.url_anuncio && (
                        <a
                          href={lead.url_anuncio}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-gray-400 hover:text-blue-600 rounded"
                          title="Ver anuncio"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      {lead.estado === 'respondido' && (
                        <button
                          onClick={() => setConvertirLead(lead)}
                          className="p-1 text-gray-400 hover:text-green-600 rounded"
                          title="Convertir en proveedor"
                        >
                          <UserPlus size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => onEditLead(lead)}
                        className="p-1 text-gray-400 hover:text-blue-600 rounded"
                        title="Editar estado"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => onDeleteLead(lead.id)}
                        className="p-1 text-gray-400 hover:text-red-600 rounded"
                        title="Eliminar lead"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {convertirLead && (
        <ConvertirProveedorModal
          lead={convertirLead}
          onClose={() => setConvertirLead(null)}
          onConverted={() => { setConvertirLead(null); if (onRefresh) onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Vista detalle campaña ────────────────────────────────────────────────────
function CampanaDetail({ campana, onBack, onRefresh, onEditLead, onDeleteLead, agentStatus }) {
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const loadLeads = useCallback(() => {
    setLoadingLeads(true);
    captacionApi.getLeads({ campana_id: campana.id })
      .then(setLeads)
      .finally(() => setLoadingLeads(false));
  }, [campana.id]);

  useEffect(loadLeads, [loadLeads]);

  const stats = {
    total: leads.length,
    nuevo: leads.filter(l => l.estado === 'nuevo').length,
    enviado: leads.filter(l => l.estado === 'enviado').length,
    respondido: leads.filter(l => l.estado === 'respondido').length,
    convertido: leads.filter(l => l.estado === 'convertido').length,
  };

  const handleScrape = async () => {
    setActionLoading('scrape');
    try {
      await captacionApi.createTarea({
        tipo: 'scrape',
        payload: {
          campana_id: campana.id,
          url_inicial: campana.url_inicial || null,
          poblacion: campana.poblacion,
          provincia: campana.provincia,
          tipo: campana.tipo,
          precio_min: campana.precio_min,
          precio_max: campana.precio_max,
          max_paginas: campana.max_paginas || 3,
        },
      });
      alert('Tarea de scraping creada. El agente la ejecutará en breve.');
    } catch (err) {
      alert('Error creando tarea: ' + err.message);
    }
    setActionLoading('');
  };

  const handleSendWA = async () => {
    const leadsToSend = leads.filter(l => l.estado === 'nuevo' && l.telefono);
    if (leadsToSend.length === 0) {
      alert('No hay leads nuevos con teléfono para enviar.');
      return;
    }
    if (!agentStatus?.whatsapp_connected) {
      alert('WhatsApp no está conectado. Abre el agente y escanea el QR.');
      return;
    }
    setActionLoading('wa_send');
    try {
      await captacionApi.createTarea({
        tipo: 'whatsapp_send',
        payload: {
          campana_id: campana.id,
          leads: leadsToSend,
          plantilla_mensaje: campana.plantilla_mensaje,
        },
      });
      alert(`Tarea creada para enviar WhatsApp a ${leadsToSend.length} leads.`);
    } catch (err) {
      alert('Error creando tarea: ' + err.message);
    }
    setActionLoading('');
  };

  const handleFollowup = async () => {
    const diasFollowup = campana.dias_followup || 3;
    const cutoff = new Date(Date.now() - diasFollowup * 24 * 3600 * 1000);
    const leadsFollowup = leads.filter(l =>
      l.estado === 'enviado' &&
      l.telefono &&
      (!l.ultimo_contacto || new Date(l.ultimo_contacto) < cutoff)
    );
    if (leadsFollowup.length === 0) {
      alert(`No hay leads enviados hace más de ${diasFollowup} días para hacer follow-up.`);
      return;
    }
    if (!agentStatus?.whatsapp_connected) {
      alert('WhatsApp no está conectado. Abre el agente y escanea el QR.');
      return;
    }
    setActionLoading('followup');
    try {
      await captacionApi.createTarea({
        tipo: 'whatsapp_followup',
        payload: {
          campana_id: campana.id,
          leads: leadsFollowup,
          plantilla_mensaje: campana.plantilla_followup || campana.plantilla_mensaje,
        },
      });
      alert(`Tarea de follow-up creada para ${leadsFollowup.length} leads.`);
    } catch (err) {
      alert('Error creando tarea: ' + err.message);
    }
    setActionLoading('');
  };

  const handleEditLead = (lead) => onEditLead(lead, loadLeads);
  const handleDeleteLead = async (id) => {
    if (!confirm('¿Eliminar este lead?')) return;
    await captacionApi.deleteLead(id);
    loadLeads();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-gray-500 hover:text-gray-800 text-sm"
        >
          <ChevronLeft size={16} /> Volver
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900">{campana.nombre}</h2>
          <p className="text-sm text-gray-500 capitalize">
            {campana.portal} · {campana.tipo} · {campana.poblacion || campana.provincia || '—'} ·{' '}
            {campana.precio_min ? fmt(campana.precio_min) : '0'} – {campana.precio_max ? fmt(campana.precio_max) : 'sin límite'}
          </p>
        </div>
        <Badge color={ESTADO_CAMPANA_COLORS[campana.estado] || 'gray'}>
          {campana.estado}
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-5 gap-3 mb-4">
        {[
          { label: 'Total leads', value: stats.total, color: 'text-gray-700' },
          { label: 'Nuevos', value: stats.nuevo, color: 'text-blue-600' },
          { label: 'Enviados', value: stats.enviado, color: 'text-yellow-600' },
          { label: 'Respondidos', value: stats.respondido, color: 'text-green-600' },
          { label: 'Convertidos', value: stats.convertido, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Acciones */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={handleScrape}
          disabled={actionLoading === 'scrape'}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <Search size={14} />
          {actionLoading === 'scrape' ? 'Creando tarea...' : 'Iniciar scraping'}
        </button>
        <button
          onClick={handleSendWA}
          disabled={actionLoading === 'wa_send'}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <MessageSquare size={14} />
          {actionLoading === 'wa_send' ? 'Creando tarea...' : `Enviar WhatsApp a nuevos (${stats.nuevo})`}
        </button>
        <button
          onClick={handleFollowup}
          disabled={actionLoading === 'followup'}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <MessageSquare size={14} />
          {actionLoading === 'followup' ? 'Creando tarea...' : 'Enviar follow-up'}
        </button>
        <button
          onClick={loadLeads}
          className="flex items-center gap-2 px-3 py-2 border border-gray-300 hover:bg-gray-50 text-gray-600 rounded-lg text-sm"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Leads */}
      {loadingLeads ? (
        <div className="text-center py-8 text-gray-400 text-sm">Cargando leads...</div>
      ) : (
        <LeadsTable
          leads={leads}
          showCampana={false}
          onEditLead={handleEditLead}
          onDeleteLead={handleDeleteLead}
          onRefresh={loadLeads}
        />
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Captacion() {
  const [campanas, setCampanas] = useState([]);
  const [allLeads, setAllLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [agentStatus, setAgentStatus] = useState(null);
  const [view, setView] = useState('campanas'); // 'campanas' | 'leads'
  const [selectedCampana, setSelectedCampana] = useState(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editLeadModal, setEditLeadModal] = useState(false);
  const [editingLead, setEditingLead] = useState(null);
  const [editLeadCallback, setEditLeadCallback] = useState(null);

  const loadCampanas = useCallback(() => {
    setLoading(true);
    captacionApi.getCampanas()
      .then(setCampanas)
      .finally(() => setLoading(false));
  }, []);

  const loadAllLeads = useCallback(() => {
    captacionApi.getLeads({}).then(setAllLeads);
  }, []);

  const loadAgentStatus = useCallback(() => {
    captacionApi.getAgentStatus().then(setAgentStatus).catch(() => {});
  }, []);

  useEffect(() => {
    loadCampanas();
    loadAllLeads();
    loadAgentStatus();
  }, [loadCampanas, loadAllLeads, loadAgentStatus]);

  // Refresh agent status every 15s
  useEffect(() => {
    const interval = setInterval(loadAgentStatus, 15000);
    return () => clearInterval(interval);
  }, [loadAgentStatus]);

  const openCreate = () => { setEditing(null); setModal(true); };
  const openEdit = (c, e) => { e.stopPropagation(); setEditing(c); setModal(true); };

  const handleSaved = () => { loadCampanas(); loadAllLeads(); };

  const handleSaveAndScrape = async (campana) => {
    loadCampanas();
    try {
      await captacionApi.createTarea({
        tipo: 'scrape',
        payload: {
          campana_id: campana.id,
          url_inicial: campana.url_inicial || null,
          poblacion: campana.poblacion,
          provincia: campana.provincia,
          tipo: campana.tipo,
          precio_min: campana.precio_min,
          precio_max: campana.precio_max,
          max_paginas: campana.max_paginas || 3,
        },
      });
      alert('Campaña guardada. Tarea de scraping creada. El agente la ejecutará en breve.');
    } catch (err) {
      alert('Campaña guardada, pero error creando tarea de scraping: ' + err.message);
    }
  };

  const handleToggleEstado = async (c, e) => {
    e.stopPropagation();
    const newEstado = c.estado === 'activa' ? 'pausada' : 'activa';
    await captacionApi.updateCampana(c.id, { estado: newEstado });
    loadCampanas();
  };

  const handleDelete = async (c, e) => {
    e.stopPropagation();
    if (!confirm(`¿Eliminar campaña "${c.nombre}" y todos sus leads?`)) return;
    await captacionApi.deleteCampana(c.id);
    loadCampanas();
    loadAllLeads();
  };

  const handleEditLead = (lead, callback) => {
    setEditingLead(lead);
    setEditLeadCallback(() => callback || null);
    setEditLeadModal(true);
  };

  const handleLeadSaved = (updated) => {
    // Actualizar en allLeads
    setAllLeads(prev => prev.map(l => l.id === updated.id ? { ...l, ...updated } : l));
    if (editLeadCallback) editLeadCallback();
  };

  const handleDeleteLeadAll = async (id) => {
    if (!confirm('¿Eliminar este lead?')) return;
    await captacionApi.deleteLead(id);
    loadAllLeads();
  };

  // Si hay campaña seleccionada, mostrar detalle
  if (selectedCampana) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <CampanaDetail
          campana={selectedCampana}
          onBack={() => { setSelectedCampana(null); loadCampanas(); loadAllLeads(); }}
          onRefresh={loadCampanas}
          onEditLead={handleEditLead}
          onDeleteLead={async (id) => { await captacionApi.deleteLead(id); }}
          agentStatus={agentStatus}
        />
        <LeadEditModal
          open={editLeadModal}
          onClose={() => setEditLeadModal(false)}
          lead={editingLead}
          onSaved={handleLeadSaved}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Captación</h1>
          <p className="text-sm text-gray-500 mt-0.5">Scraping automático y contacto por WhatsApp</p>
        </div>
        <div className="flex items-center gap-3">
          <AgentStatusBar status={agentStatus} onRefresh={loadAgentStatus} />
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            <Plus size={16} />
            Nueva campaña
          </button>
        </div>
      </div>

      {/* QR panel si WA no conectado */}
      {agentStatus?.online && !agentStatus?.whatsapp_connected && agentStatus?.qr_code && (
        <QRPanel qrCode={agentStatus.qr_code} />
      )}

      {/* Toggle de vista */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setView('campanas')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'campanas' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutGrid size={14} /> Campañas
        </button>
        <button
          onClick={() => { setView('leads'); loadAllLeads(); }}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            view === 'leads' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <List size={14} /> Todos los leads
        </button>
      </div>

      {/* Vista Campañas */}
      {view === 'campanas' && (
        loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Cargando campañas...</div>
        ) : campanas.length === 0 ? (
          <div className="text-center py-16">
            <Search size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Sin campañas todavía</p>
            <p className="text-sm text-gray-400 mt-1">Crea tu primera campaña para empezar a captar leads de Idealista</p>
            <button
              onClick={openCreate}
              className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
            >
              + Nueva campaña
            </button>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Portal</th>
                  <th className="px-4 py-3 font-medium">Ubicación</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Precio</th>
                  <th className="px-4 py-3 font-medium">Leads</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {campanas.map(c => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => setSelectedCampana(c)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{c.nombre}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{c.portal}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.poblacion || c.provincia || '—'}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-600">{c.tipo}</td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {c.precio_min || c.precio_max
                        ? `${fmt(c.precio_min)} – ${fmt(c.precio_max)}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 items-center">
                        <span className="font-semibold text-gray-800">{c.leads_total}</span>
                        {c.leads_nuevo > 0 && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                            {c.leads_nuevo} nuevos
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={ESTADO_CAMPANA_COLORS[c.estado] || 'gray'}>
                        {c.estado}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={e => handleToggleEstado(c, e)}
                          className="p-1.5 text-gray-400 hover:text-green-600 rounded transition-colors"
                          title={c.estado === 'activa' ? 'Pausar' : 'Activar'}
                        >
                          {c.estado === 'activa' ? <Pause size={14} /> : <Play size={14} />}
                        </button>
                        <button
                          onClick={e => openEdit(c, e)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={e => handleDelete(c, e)}
                          className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Vista Todos los leads */}
      {view === 'leads' && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-800">Todos los leads</h2>
            <button onClick={loadAllLeads} className="text-gray-400 hover:text-gray-600">
              <RefreshCw size={14} />
            </button>
          </div>
          <LeadsTable
            leads={allLeads}
            showCampana={true}
            onEditLead={(lead) => handleEditLead(lead, loadAllLeads)}
            onDeleteLead={handleDeleteLeadAll}
            onRefresh={loadAllLeads}
          />
        </div>
      )}

      {/* Modal nueva/editar campaña */}
      <CampanaModal
        open={modal}
        onClose={() => setModal(false)}
        editing={editing}
        onSaved={handleSaved}
        onSaveAndScrape={handleSaveAndScrape}
      />

      {/* Modal editar lead */}
      <LeadEditModal
        open={editLeadModal}
        onClose={() => setEditLeadModal(false)}
        lead={editingLead}
        onSaved={handleLeadSaved}
      />
    </div>
  );
}
