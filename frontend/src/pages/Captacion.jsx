import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { captacionApi } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import Combobox, { ComboboxMunicipios } from '../components/Combobox';
import { PROVINCIAS } from '../data/municipios';
import {
  Plus, Search, Wifi, WifiOff, RefreshCw, ChevronLeft,
  Play, Pause, Pencil, Trash2, MessageSquare, ExternalLink,
  LayoutGrid, List, Smartphone, UserPlus, Settings, Copy, Check,
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
  enviado: 'amber',
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

// Clasifica un teléfono en 'movil' / 'fijo' / 'sin_telefono' / 'otro'.
// Móvil = 6xxx o 7xxx, Fijo = 8xxx o 9xxx (ambos ≡ 9 dígitos).
// Admite prefijo +34 / 34 opcional, espacios y guiones.
function tipoTelefono(tel) {
  if (!tel) return 'sin_telefono';
  const clean = String(tel).replace(/[\s\-+]/g, '').replace(/^34/, '');
  if (!/^\d{9}$/.test(clean)) return 'otro';
  if (/^[67]/.test(clean)) return 'movil';
  if (/^[89]/.test(clean)) return 'fijo';
  return 'otro';
}

const TIPO_TEL_LABELS = {
  movil: 'Móvil',
  fijo: 'Fijo',
  sin_telefono: 'Sin teléfono',
  otro: 'Otro',
};

const TIPO_TEL_COLORS = {
  movil: 'green',
  fijo: 'blue',
  sin_telefono: 'gray',
  otro: 'yellow',
};

// Parsea el JSONB de características y devuelve campos estructurados para
// mostrar directamente en la UI (sin tooltip).
function parseCaracteristicas(c) {
  if (!c || typeof c !== 'object') return null;
  const allItems = Object.values(c).flat().filter(Boolean);
  if (allItems.length === 0) return null;
  const joined = allItems.join(' · ').toLowerCase();

  const m2 = joined.match(/(\d+)\s*m[²2]\s*construidos/i)?.[1]
           || joined.match(/(\d+)\s*m[²2]/i)?.[1];
  const hab = joined.match(/(\d+)\s*habitaci/i)?.[1];
  const banos = joined.match(/(\d+)\s*baño/i)?.[1];
  const planta = joined.match(/(planta\s+\S+(?:\s+\w+)?)/i)?.[1];

  const flags = [];
  if (joined.includes('con ascensor')) flags.push('Ascensor');
  if (joined.includes('sin ascensor')) flags.push('Sin ascensor');
  if (joined.includes('para reformar')) flags.push('Para reformar');
  else if (joined.includes('buen estado')) flags.push('Buen estado');
  else if (joined.includes('obra nueva')) flags.push('Obra nueva');
  if (joined.includes('calefacción')) {
    const cal = joined.match(/calefacción\s+(\w+)/i);
    if (cal) flags.push(`Calef. ${cal[1]}`);
  }
  if (joined.includes('orientación')) {
    const ori = joined.match(/orientación\s+(\w+)/i);
    if (ori) flags.push(`Orient. ${ori[1]}`);
  }
  if (joined.includes('exterior')) flags.push('Exterior');
  else if (joined.includes('interior')) flags.push('Interior');
  if (joined.includes('movilidad reducida')) flags.push('Adaptado');

  // Certificado energético
  const cert = Object.entries(c).find(([k]) => k.toLowerCase().includes('energ'));
  const certValue = cert ? cert[1].join(', ') : null;

  return { m2, hab, banos, planta, flags, certValue };
}

// Componente que muestra las características del lead de forma compacta
// siempre visible (sin tooltip).
function LeadCaracteristicas({ caracteristicas, tipo }) {
  const parsed = parseCaracteristicas(caracteristicas);

  if (!parsed) {
    return <span className="capitalize text-gray-600">{tipo || '—'}</span>;
  }

  const { m2, hab, banos, planta, flags, certValue } = parsed;

  return (
    <div className="space-y-1">
      {/* Tipo + métricas principales como badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="capitalize font-medium text-gray-800 text-xs">{tipo || '—'}</span>
        {m2 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-semibold">
            {m2}m²
          </span>
        )}
        {hab && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-semibold">
            {hab}h
          </span>
        )}
        {banos && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 text-[10px] font-semibold">
            {banos}b
          </span>
        )}
      </div>

      {/* Flags secundarios: ascensor, estado, planta, orientación, etc. */}
      {(flags.length > 0 || planta) && (
        <div className="text-[10px] text-gray-500 leading-tight">
          {[planta ? planta.charAt(0).toUpperCase() + planta.slice(1) : null, ...flags]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}

      {/* Certificado energético */}
      {certValue && certValue.toLowerCase() !== 'en trámite' && (
        <div className="text-[10px] text-gray-400">Cert. {certValue}</div>
      )}
    </div>
  );
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
// ─── Modal de configuración del agente ───────────────────────────────────────
// Muestra al usuario un botón de descarga de instalador automático para su
// SO. El instalador ya lleva embebida la clave única del usuario, así que
// no hace falta tocar Terminal ni pegar claves. Solo doble clic y listo.
function AgentSetupModal({ open, onClose, agentStatus }) {
  const [keyData, setKeyData] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [downloaded, setDownloaded] = useState(null);

  // ¿El agente ya está conectado y listo?
  const alreadyRunning = !!(agentStatus?.online && agentStatus?.whatsapp_connected);
  const runningButNoWa = !!(agentStatus?.online && !agentStatus?.whatsapp_connected);

  // Auto-detectar el SO del navegador
  const detectedOS = (() => {
    const ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '').toLowerCase();
    if (ua.includes('mac')) return 'mac';
    if (ua.includes('win')) return 'windows';
    if (ua.includes('linux')) return 'linux';
    return 'mac';
  })();
  const [osTab, setOsTab] = useState(detectedOS);

  useEffect(() => {
    if (open && !keyData) {
      captacionApi.getMyAgentKey().then(setKeyData).catch(() => {});
    }
  }, [open, keyData]);

  const handleDownload = async (os) => {
    setDownloading(os);
    try {
      await captacionApi.downloadInstaller(os);
      setDownloaded(os);
      setTimeout(() => setDownloaded(null), 4000);
    } catch (err) {
      alert('Error descargando el instalador: ' + (err.message || 'desconocido'));
    }
    setDownloading(null);
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Conectar tu agente de WhatsApp" size="lg">
      <div className="space-y-4 text-sm">
        {/* Aviso: tu agente ya está funcionando */}
        {alreadyRunning && (
          <div className="p-3 bg-green-50 border-2 border-green-400 rounded-lg flex items-start gap-2">
            <Check size={18} className="text-green-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-green-900 font-semibold mb-0.5">
                Tu agente ya está conectado y funcionando ✓
              </p>
              <p className="text-green-800 text-xs leading-relaxed">
                WhatsApp está vinculado y el agente está online. <strong>No necesitas
                descargar nada</strong>. Puedes cerrar esta ventana — solo está pensada
                para usuarios que van a conectar el agente por primera vez.
              </p>
            </div>
          </div>
        )}

        {/* Aviso: agente online pero WhatsApp sin vincular */}
        {runningButNoWa && (
          <div className="p-3 bg-orange-50 border-2 border-orange-400 rounded-lg flex items-start gap-2">
            <Smartphone size={18} className="text-orange-700 mt-0.5 shrink-0" />
            <div>
              <p className="text-orange-900 font-semibold mb-0.5">
                Tu agente está online pero WhatsApp no está vinculado
              </p>
              <p className="text-orange-800 text-xs leading-relaxed">
                No hace falta que descargues nada. Vuelve a la página de Captación
                y escanea el QR grande que debería estar apareciendo arriba.
              </p>
            </div>
          </div>
        )}

        {/* Info para usuarios nuevos */}
        {!alreadyRunning && !runningButNoWa && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-blue-900 font-semibold mb-1">¿Qué es esto?</p>
            <p className="text-blue-800 text-xs leading-relaxed">
              Para que el CRM pueda enviar WhatsApp desde tu cuenta, necesitas instalar
              un pequeño "agente" en tu PC. Es automático: descarga el instalador abajo,
              dale <strong>doble clic</strong>, y listo. El instalador ya lleva tu clave
              personal dentro, así que no tienes que copiar ni pegar nada.
            </p>
          </div>
        )}

        {/* Tabs de SO */}
        <div>
          <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setOsTab('mac')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                osTab === 'mac' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🍎 macOS
            </button>
            <button
              onClick={() => setOsTab('windows')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                osTab === 'windows' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🪟 Windows
            </button>
          </div>

          {/* Botón de descarga grande */}
          <button
            onClick={() => handleDownload(osTab)}
            disabled={downloading !== null || !keyData}
            className="w-full p-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl shadow-md font-semibold flex items-center justify-center gap-3 transition-all disabled:opacity-60"
          >
            {downloading === osTab ? (
              <>Preparando instalador...</>
            ) : downloaded === osTab ? (
              <><Check size={20} /> ¡Descargado! Revisa tu carpeta de Descargas</>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Descargar instalador para {osTab === 'mac' ? 'macOS' : 'Windows'}
              </>
            )}
          </button>

          {/* Instrucciones tras descargar */}
          <div className="mt-4 text-xs text-gray-700 space-y-2 bg-gray-50 rounded-lg border border-gray-200 p-3">
            <p className="font-semibold text-gray-800">Qué hacer después de descargarlo:</p>

            {osTab === 'mac' && (
              <ol className="list-decimal list-inside space-y-1.5 text-gray-700">
                <li>Abre la carpeta <strong>Descargas</strong> en el Finder.</li>
                <li>Busca el fichero <code className="bg-gray-200 px-1 rounded">pisalia-agent-setup.command</code>.</li>
                <li><strong>Doble clic</strong> sobre él.</li>
                <li>Si macOS pregunta si quieres abrirlo porque es de un desarrollador no identificado, ve a <strong>Ajustes del Sistema → Privacidad y Seguridad</strong> y pulsa <strong>Abrir de todas formas</strong>.</li>
                <li>Se abrirá una ventana de Terminal y hará todo solo (2-5 min).</li>
                <li>Cuando acabe, vuelve a esta página. En 30s aparecerá un QR de WhatsApp.</li>
                <li>Escanéalo con tu móvil (WhatsApp → ⋮ → Dispositivos vinculados).</li>
              </ol>
            )}

            {osTab === 'windows' && (
              <ol className="list-decimal list-inside space-y-1.5 text-gray-700">
                <li>Abre la carpeta <strong>Descargas</strong> del Explorador de Windows.</li>
                <li>Busca el fichero <code className="bg-gray-200 px-1 rounded">pisalia-agent-setup.bat</code>.</li>
                <li><strong>Doble clic</strong> sobre él.</li>
                <li>Si Windows Defender muestra "Se impidió el inicio de una aplicación no reconocida", pulsa <strong>Más información → Ejecutar de todas formas</strong>.</li>
                <li>Si Windows pide permisos de administrador (UAC), pulsa <strong>Sí</strong>. Esto permite crear el auto-arranque.</li>
                <li>Se abrirá una ventana negra y hará todo solo (2-5 min). No la cierres.</li>
                <li>Cuando acabe, vuelve a esta página. En 30s aparecerá un QR de WhatsApp.</li>
                <li>Escanéalo con tu móvil (WhatsApp → ⋮ → Dispositivos vinculados).</li>
              </ol>
            )}

            <p className="text-amber-700 text-[11px] pt-2 border-t border-gray-200">
              ⚠ El instalador contiene tu clave personal. No lo compartas con nadie.
            </p>
          </div>
        </div>

        {/* Clave del agente — oculta por defecto, solo para debug */}
        {keyData?.agent_key && (
          <details className="text-xs text-gray-500">
            <summary className="cursor-pointer hover:text-gray-700">
              Ver mi clave de agente (avanzado)
            </summary>
            <div className="mt-2 p-2 bg-gray-50 rounded border border-gray-200 font-mono text-[11px] break-all">
              {keyData.agent_key}
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              El instalador ya lleva esta clave dentro. Solo te la enseñamos por si
              la necesitas manualmente.
            </p>
          </details>
        )}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AgentStatusBar({ status, onRefresh, onOpenSetup }) {
  const isOnline = status?.online;
  const waConnected = status?.whatsapp_connected;

  let dotClass = 'bg-red-500';
  let label = 'Agente offline';
  if (isOnline && waConnected) { dotClass = 'bg-green-500'; label = 'Agente online · WhatsApp conectado'; }
  else if (isOnline && !waConnected) { dotClass = 'bg-orange-400'; label = 'Agente online · WhatsApp desconectado'; }

  return (
    <div className="flex items-center gap-2 text-sm flex-wrap">
      <span className={`inline-block w-2 h-2 rounded-full ${dotClass} ${isOnline ? 'animate-pulse' : ''}`} />
      <span className="text-gray-600">{label}</span>
      {status?.last_seen && (
        <span className="text-gray-400 text-xs">· {timeAgo(status.last_seen)}</span>
      )}
      <button onClick={onRefresh} className="text-gray-400 hover:text-gray-600 ml-1" title="Refrescar">
        <RefreshCw size={13} />
      </button>
      {onOpenSetup && (
        <button
          onClick={onOpenSetup}
          className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 border border-gray-300 rounded-full hover:bg-gray-50 ml-1"
          title="Configurar mi agente"
        >
          <Settings size={12} /> Configurar
        </button>
      )}
    </div>
  );
}

// ─── Panel QR ─────────────────────────────────────────────────────────────────
function QRPanel({ qrCode }) {
  if (!qrCode) return null;
  return (
    <div className="mb-4 p-5 bg-orange-50 border-2 border-orange-400 rounded-xl flex items-start gap-5 shadow-lg">
      <div className="shrink-0">
        <img
          src={qrCode}
          alt="WhatsApp QR"
          className="w-44 h-44 rounded-lg border-2 border-orange-300 bg-white p-2"
        />
      </div>
      <div className="flex-1">
        <p className="font-bold text-orange-900 mb-2 flex items-center gap-2 text-lg">
          <Smartphone size={20} /> WhatsApp desconectado — Acción requerida
        </p>
        <p className="text-sm text-orange-800 mb-3">
          Para que el agente pueda seguir contactando a los leads, <strong>escanea este QR</strong> con tu WhatsApp desde el móvil:
        </p>
        <ol className="text-sm text-orange-800 list-decimal list-inside space-y-1 ml-1">
          <li>Abre <strong>WhatsApp</strong> en tu móvil.</li>
          <li>Pulsa los <strong>tres puntos (⋮)</strong> arriba a la derecha → <strong>Dispositivos vinculados</strong>.</li>
          <li>Pulsa <strong>Vincular un dispositivo</strong>.</li>
          <li>Apunta la cámara del móvil a este QR.</li>
        </ol>
        <p className="text-xs text-orange-600 mt-3 italic">
          Este QR se refresca automáticamente cada pocos segundos. Si no lo escaneas a tiempo, espera a que aparezca uno nuevo.
        </p>
      </div>
    </div>
  );
}

// ─── Modal de campaña ─────────────────────────────────────────────────────────
// ─── Modal de gestión de plantillas de mensajes ──────────────────────────────
// Permite crear, editar y eliminar plantillas reutilizables de mensajes de
// WhatsApp. Cada plantilla tiene un nombre, un texto (con variables como
// {{nombre}}, {{precio}}, etc.) y un tipo: 'inicial' (primer contacto) o
// 'followup' (recordatorio).
function PlantillasModal({ open, onClose }) {
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // plantilla que se está editando o creando
  const [saving, setSaving] = useState(false);

  const loadPlantillas = useCallback(() => {
    setLoading(true);
    captacionApi.getPlantillas()
      .then(setPlantillas)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) loadPlantillas();
  }, [open, loadPlantillas]);

  const startCreate = (tipo = 'inicial') => {
    setEditing({ id: null, nombre: '', texto: '', tipo });
  };

  const startEdit = (p) => {
    setEditing({ ...p });
  };

  const handleSave = async () => {
    if (!editing.nombre.trim() || !editing.texto.trim()) {
      alert('Pon un nombre y un texto para la plantilla.');
      return;
    }
    setSaving(true);
    try {
      if (editing.id) {
        await captacionApi.updatePlantilla(editing.id, {
          nombre: editing.nombre,
          texto: editing.texto,
          tipo: editing.tipo,
        });
      } else {
        await captacionApi.createPlantilla({
          nombre: editing.nombre,
          texto: editing.texto,
          tipo: editing.tipo,
        });
      }
      setEditing(null);
      loadPlantillas();
    } catch (err) {
      alert('Error guardando: ' + err.message);
    }
    setSaving(false);
  };

  const handleDelete = async (p) => {
    if (!confirm(`¿Eliminar la plantilla "${p.nombre}"?`)) return;
    try {
      await captacionApi.deletePlantilla(p.id);
      loadPlantillas();
    } catch (err) {
      alert('Error eliminando: ' + err.message);
    }
  };

  const plantillasIniciales = plantillas.filter(p => p.tipo === 'inicial');
  const plantillasFollowup = plantillas.filter(p => p.tipo === 'followup');

  return (
    <Modal isOpen={open} onClose={onClose} title="Plantillas de mensajes" size="lg">
      {editing ? (
        // ── Vista de edición ──
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={editing.tipo}
              onChange={e => setEditing({ ...editing, tipo: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="inicial">Inicial (primer contacto)</option>
              <option value="followup">Follow-up (recordatorio)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de la plantilla</label>
            <input
              type="text"
              value={editing.nombre}
              onChange={e => setEditing({ ...editing, nombre: e.target.value })}
              placeholder="Ej: Primer contacto formal"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Texto del mensaje
              <span className="ml-2 text-gray-400 font-normal">
                Variables: {'{{nombre}}'} {'{{precio}}'} {'{{poblacion}}'} {'{{tipo}}'} {'{{url}}'}
              </span>
            </label>
            <textarea
              rows={5}
              value={editing.texto}
              onChange={e => setEditing({ ...editing, texto: e.target.value })}
              placeholder="Hola {{nombre}}, te contacto en relación a tu anuncio..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => setEditing(null)}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Guardando...' : (editing.id ? 'Guardar cambios' : 'Crear plantilla')}
            </button>
          </div>
        </div>
      ) : (
        // ── Vista de lista ──
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-400 text-sm">Cargando plantillas...</div>
          ) : (
            <>
              {/* Sección: plantillas iniciales */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">📨 Inicial (primer contacto)</h3>
                  <button
                    onClick={() => startCreate('inicial')}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    <Plus size={12} /> Nueva
                  </button>
                </div>
                {plantillasIniciales.length === 0 ? (
                  <div className="text-xs text-gray-400 italic px-3 py-2 bg-gray-50 rounded-lg">
                    No hay plantillas iniciales. Crea la primera.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {plantillasIniciales.map(p => (
                      <PlantillaRow key={p.id} plantilla={p} onEdit={() => startEdit(p)} onDelete={() => handleDelete(p)} />
                    ))}
                  </div>
                )}
              </div>

              {/* Sección: plantillas follow-up */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-800">🔁 Follow-up (recordatorio)</h3>
                  <button
                    onClick={() => startCreate('followup')}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    <Plus size={12} /> Nueva
                  </button>
                </div>
                {plantillasFollowup.length === 0 ? (
                  <div className="text-xs text-gray-400 italic px-3 py-2 bg-gray-50 rounded-lg">
                    No hay plantillas de follow-up. Crea la primera.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {plantillasFollowup.map(p => (
                      <PlantillaRow key={p.id} plantilla={p} onEdit={() => startEdit(p)} onDelete={() => handleDelete(p)} />
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-gray-100">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}

function PlantillaRow({ plantilla, onEdit, onDelete }) {
  return (
    <div className="flex items-start gap-2 p-2 bg-gray-50 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{plantilla.nombre}</p>
        <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{plantilla.texto}</p>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onEdit}
          className="p-1.5 text-gray-400 hover:text-blue-600 rounded transition-colors"
          title="Editar"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded transition-colors"
          title="Eliminar"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function CampanaModal({ open, onClose, editing, onSaved, onSaveAndScrape }) {
  const [form, setForm] = useState(emptyCampana);
  const [saving, setSaving] = useState(false);
  const [plantillas, setPlantillas] = useState([]);

  // Cargar plantillas disponibles cuando se abre el modal
  useEffect(() => {
    if (open) {
      captacionApi.getPlantillas().then(setPlantillas).catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setForm(editing ? {
        nombre: editing.nombre || '',
        portal: editing.portal || 'idealista',
        url_inicial: editing.url_inicial || '',
        provincia: editing.provincia || '',
        poblacion: editing.poblacion || '',
        tipo: editing.tipo || 'piso',
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

  // Guardar el texto actual de un textarea como plantilla reutilizable
  const saveAsTemplate = async (tipo) => {
    const texto = tipo === 'inicial' ? form.plantilla_mensaje : form.plantilla_followup;
    if (!texto || !texto.trim()) {
      alert('El texto está vacío. Escribe algo antes de guardarlo como plantilla.');
      return;
    }
    const nombre = prompt(`Nombre para la plantilla ${tipo === 'inicial' ? 'inicial' : 'de follow-up'}:`);
    if (!nombre || !nombre.trim()) return;
    try {
      const nueva = await captacionApi.createPlantilla({ nombre: nombre.trim(), texto, tipo });
      setPlantillas(prev => [nueva, ...prev]);
      alert(`✓ Plantilla "${nombre}" guardada.`);
    } catch (err) {
      alert('Error guardando la plantilla: ' + err.message);
    }
  };

  // Cargar una plantilla seleccionada del dropdown al textarea
  const loadTemplate = (tipo, plantillaId) => {
    if (!plantillaId) return;
    const p = plantillas.find(x => x.id === plantillaId);
    if (!p) return;
    if (tipo === 'inicial') set('plantilla_mensaje', p.texto);
    else set('plantilla_followup', p.texto);
  };

  const plantillasIniciales = plantillas.filter(p => p.tipo === 'inicial');
  const plantillasFollowup = plantillas.filter(p => p.tipo === 'followup');

  const handleSave = async (andScrape = false) => {
    if (!form.nombre.trim()) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
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

        {/* Máx. páginas */}
        <div className="w-40">
          <label className="block text-sm font-medium text-gray-700 mb-1">Máx. páginas</label>
          <input
            type="number"
            min="1"
            max="20"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            value={form.max_paginas}
            onChange={e => set('max_paginas', e.target.value)}
          />
          <p className="text-xs text-gray-400 mt-1">
            Cuántas páginas de resultados scrapear. Los filtros de precio
            y tipo los pones directamente en la URL de Idealista.
          </p>
        </div>

        {/* Plantilla mensaje inicial */}
        <div>
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <label className="block text-sm font-medium text-gray-700">
              Plantilla mensaje inicial
              <span className="ml-2 text-xs text-gray-400 font-normal">
                Variables: {'{{nombre}}'} {'{{precio}}'} {'{{poblacion}}'} {'{{tipo}}'}
              </span>
            </label>
            <div className="flex items-center gap-1">
              {plantillasIniciales.length > 0 && (
                <select
                  value=""
                  onChange={e => loadTemplate('inicial', e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="">Cargar plantilla...</option>
                  {plantillasIniciales.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => saveAsTemplate('inicial')}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1"
                title="Guardar este texto como plantilla reutilizable"
              >
                💾 Guardar como plantilla
              </button>
            </div>
          </div>
          <textarea
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none"
            value={form.plantilla_mensaje}
            onChange={e => set('plantilla_mensaje', e.target.value)}
          />
        </div>

        {/* Plantilla follow-up */}
        <div>
          <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
            <label className="block text-sm font-medium text-gray-700">Plantilla follow-up</label>
            <div className="flex items-center gap-1">
              {plantillasFollowup.length > 0 && (
                <select
                  value=""
                  onChange={e => loadTemplate('followup', e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                >
                  <option value="">Cargar plantilla...</option>
                  {plantillasFollowup.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => saveAsTemplate('followup')}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1"
                title="Guardar este texto como plantilla reutilizable"
              >
                💾 Guardar como plantilla
              </button>
            </div>
          </div>
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
  const [filterTipoTel, setFilterTipoTel] = useState('');
  const [filterProvincia, setFilterProvincia] = useState('');
  const [filterPoblacion, setFilterPoblacion] = useState('');
  const [convertirLead, setConvertirLead] = useState(null);
  const [enviosModal, setEnviosModal] = useState(null); // lead del que mostrar envíos

  const filtered = leads.filter(l => {
    if (filterEstado && l.estado !== filterEstado) return false;
    if (filterTipoTel && tipoTelefono(l.telefono) !== filterTipoTel) return false;
    if (filterProvincia && l.provincia !== filterProvincia) return false;
    if (filterPoblacion && !(l.poblacion || '').toLowerCase().includes(filterPoblacion.toLowerCase())) return false;
    return true;
  });

  const clearFilters = () => {
    setFilterEstado('');
    setFilterTipoTel('');
    setFilterProvincia('');
    setFilterPoblacion('');
  };

  const hasFilters = filterEstado || filterTipoTel || filterProvincia || filterPoblacion;

  // Conteos por tipo de teléfono
  const countMovil = leads.filter(l => tipoTelefono(l.telefono) === 'movil').length;
  const countFijo = leads.filter(l => tipoTelefono(l.telefono) === 'fijo').length;
  const countSin = leads.filter(l => tipoTelefono(l.telefono) === 'sin_telefono').length;
  const countOtro = leads.filter(l => tipoTelefono(l.telefono) === 'otro').length;

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

      {/* Filtro de tipo de teléfono — crítico para WhatsApp (solo móvil funciona) */}
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        <span className="text-xs text-gray-500 font-medium mr-1">Teléfono:</span>
        <button
          onClick={() => setFilterTipoTel('')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            filterTipoTel === '' ? 'bg-gray-800 text-white border-gray-800' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          Todos ({leads.length})
        </button>
        <button
          onClick={() => setFilterTipoTel('movil')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            filterTipoTel === 'movil' ? 'bg-green-600 text-white border-green-600' : 'text-green-700 border-green-300 hover:bg-green-50'
          }`}
        >
          📱 Móvil ({countMovil})
        </button>
        <button
          onClick={() => setFilterTipoTel('fijo')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            filterTipoTel === 'fijo' ? 'bg-blue-600 text-white border-blue-600' : 'text-blue-700 border-blue-300 hover:bg-blue-50'
          }`}
        >
          ☎ Fijo ({countFijo})
        </button>
        <button
          onClick={() => setFilterTipoTel('sin_telefono')}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            filterTipoTel === 'sin_telefono' ? 'bg-gray-700 text-white border-gray-700' : 'text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          ∅ Sin teléfono ({countSin})
        </button>
        {countOtro > 0 && (
          <button
            onClick={() => setFilterTipoTel('otro')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filterTipoTel === 'otro' ? 'bg-yellow-600 text-white border-yellow-600' : 'text-yellow-700 border-yellow-300 hover:bg-yellow-50'
            }`}
          >
            ? Otro ({countOtro})
          </button>
        )}
      </div>

      {/* Filtro de estado */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <span className="text-xs text-gray-500 font-medium mr-1">Estado:</span>
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
        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
                <th className="pb-2 pr-3 font-medium">Vendedor</th>
                <th className="pb-2 pr-3 font-medium">Teléfono</th>
                <th className="pb-2 pr-3 font-medium">Inmueble</th>
                <th className="pb-2 pr-3 font-medium">Precio</th>
                <th className="pb-2 pr-3 font-medium">Población</th>
                <th className="pb-2 pr-3 font-medium">Estado</th>
                <th className="pb-2 pr-3 font-medium text-center">WhatsApp</th>
                {showCampana && <th className="pb-2 pr-3 font-medium">Campaña</th>}
                <th className="pb-2 pr-3 font-medium">Último contacto</th>
                <th className="pb-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(lead => (
                <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                  <td className="py-2 pr-3 font-medium text-gray-800">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span>{lead.nombre_vendedor || '—'}</span>
                      {lead.es_particular === false &&
                       !(lead.nombre_vendedor || '').toLowerCase().startsWith('particular') && (
                        <span className="text-xs text-gray-400">(agencia)</span>
                      )}
                      {lead.duplicado_de && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full" title="Este teléfono ya apareció en otra campaña">
                          DUPLICADO
                        </span>
                      )}
                      {lead.proveedor_id && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700 rounded-full" title="El teléfono coincide con un proveedor existente">
                          PROVEEDOR
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-gray-600 font-mono text-xs">
                    {(() => {
                      const tipo = tipoTelefono(lead.telefono);
                      if (tipo === 'sin_telefono') return <span className="text-gray-300">—</span>;
                      const icon = tipo === 'movil' ? '📱' : tipo === 'fijo' ? '☎' : '?';
                      const color = tipo === 'movil' ? 'text-green-700' : tipo === 'fijo' ? 'text-blue-700' : 'text-yellow-700';
                      return (
                        <span className={color} title={TIPO_TEL_LABELS[tipo]}>
                          {icon} {lead.telefono}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2 pr-3">
                    <LeadCaracteristicas
                      caracteristicas={lead.caracteristicas}
                      tipo={lead.tipo}
                    />
                  </td>
                  <td className="py-2 pr-3 text-gray-800">{fmt(lead.precio)}</td>
                  <td className="py-2 pr-3 text-gray-600">{lead.poblacion || lead.provincia || '—'}</td>
                  <td className="py-2 pr-3">
                    <Badge color={ESTADO_LEAD_COLORS[lead.estado] || 'gray'}>
                      {ESTADO_LEAD_LABELS[lead.estado] || lead.estado}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-center">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const nuevoEstado = lead.estado === 'nuevo' ? 'enviado' : 'nuevo';
                        await captacionApi.updateLead(lead.id, {
                          estado: nuevoEstado,
                          ultimo_contacto: nuevoEstado === 'enviado' ? new Date().toISOString() : null,
                        });
                        if (onRefresh) onRefresh();
                      }}
                      title={
                        lead.estado === 'nuevo'
                          ? 'Marcar como enviado manualmente'
                          : 'Marcar como no enviado'
                      }
                      className="hover:bg-gray-100 rounded p-1"
                    >
                      {lead.estado === 'nuevo' ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : lead.ultimo_ack === 'leido' ? (
                        <span className="text-blue-500 text-sm font-semibold">✓✓</span>
                      ) : lead.ultimo_ack === 'entregado' ? (
                        <span className="text-gray-500 text-sm font-semibold">✓✓</span>
                      ) : (
                        <span className="text-gray-400 text-sm">✓</span>
                      )}
                    </button>
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
                      {(lead.estado === 'enviado' || lead.estado === 'respondido' || lead.estado === 'convertido') && (
                        <button
                          onClick={() => setEnviosModal(lead)}
                          className="p-1 text-gray-400 hover:text-blue-600 rounded"
                          title="Ver mensajes enviados"
                        >
                          <MessageSquare size={14} />
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

      <EnviosHistoryModal
        lead={enviosModal}
        onClose={() => setEnviosModal(null)}
      />
    </div>
  );
}

// ─── Modal: historial de WhatsApps enviados a un lead ─────────────────────────
function EnviosHistoryModal({ lead, onClose }) {
  const [envios, setEnvios] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!lead) return;
    setLoading(true);
    captacionApi.getLeadEnvios(lead.id)
      .then(setEnvios)
      .catch(() => setEnvios([]))
      .finally(() => setLoading(false));
  }, [lead]);

  if (!lead) return null;

  const ackLabel = {
    pendiente: { text: 'Pendiente', color: 'text-gray-400' },
    enviado: { text: '✓ Enviado', color: 'text-gray-500' },
    entregado: { text: '✓✓ Entregado', color: 'text-gray-600' },
    leido: { text: '✓✓ Leído', color: 'text-blue-500 font-medium' },
  };

  return (
    <Modal isOpen={!!lead} onClose={onClose} title={`Mensajes enviados a ${lead.nombre_vendedor || lead.telefono || 'lead'}`} size="md">
      {loading ? (
        <p className="text-center py-8 text-gray-400 text-sm">Cargando…</p>
      ) : envios.length === 0 ? (
        <p className="text-center py-8 text-gray-400 text-sm">No hay mensajes enviados todavía.</p>
      ) : (
        <div className="space-y-3">
          {envios.map(e => {
            const ack = ackLabel[e.ack_status || 'enviado'] || ackLabel.enviado;
            return (
              <div key={e.id} className="border border-gray-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="text-gray-400">
                    {e.tipo === 'followup' ? '🔔 Follow-up' : '💬 Inicial'} · {new Date(e.created_at).toLocaleString('es-ES')}
                  </span>
                  <span className={ack.color}>{ack.text}</span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{e.mensaje || '(sin contenido guardado)'}</p>
                {e.ack_at && e.ack_status === 'leido' && (
                  <p className="text-[10px] text-blue-500 mt-1">Leído el {new Date(e.ack_at).toLocaleString('es-ES')}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

// ─── Vista detalle campaña ────────────────────────────────────────────────────
function CampanaDetail({ campana, onBack, onRefresh, onEditLead, onDeleteLead, onEditCampana, agentStatus }) {
  const [leads, setLeads] = useState([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [activeTask, setActiveTask] = useState(null); // tarea de scrape activa si la hay
  const [waSelectModal, setWaSelectModal] = useState(null); // { leads, tipo: 'inicial' | 'followup' }

  const loadLeads = useCallback(() => {
    setLoadingLeads(true);
    captacionApi.getLeads({ campana_id: campana.id })
      .then(setLeads)
      .finally(() => setLoadingLeads(false));
  }, [campana.id]);

  useEffect(loadLeads, [loadLeads]);

  // Auto-refresh de leads Y de la tarea activa cada 5 segundos. Esto hace
  // que los leads aparezcan en tiempo real y que el botón "Pausar" aparezca
  // cuando hay un scraping en curso.
  useEffect(() => {
    const refresh = () => {
      captacionApi.getLeads({ campana_id: campana.id })
        .then(setLeads)
        .catch(() => {});
      captacionApi.getCampanaActiveTask(campana.id)
        .then(r => setActiveTask(r.task || null))
        .catch(() => {});
    };
    refresh(); // inmediato al montar
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [campana.id]);

  const handlePauseScrape = async () => {
    if (!activeTask) return;
    if (!confirm('¿Pausar el scraping en curso? Los leads ya extraídos se mantendrán. Podrás volver a lanzarlo cuando quieras.')) return;
    setActionLoading('pause');
    try {
      await captacionApi.cancelTarea(activeTask.id);
      setActiveTask(null);
    } catch (err) {
      alert('Error pausando: ' + err.message);
    }
    setActionLoading('');
  };

  const stats = {
    total: leads.length,
    nuevo: leads.filter(l => l.estado === 'nuevo').length,
    enviado: leads.filter(l => l.estado === 'enviado').length,
    respondido: leads.filter(l => l.estado === 'respondido').length,
    convertido: leads.filter(l => l.estado === 'convertido').length,
    duplicados: leads.filter(l => l.duplicado_de).length,
    con_proveedor: leads.filter(l => l.proveedor_id).length,
    // Solo los móviles no-duplicados son contactables por WhatsApp
    nuevos_movil: leads.filter(l =>
      l.estado === 'nuevo' && tipoTelefono(l.telefono) === 'movil' && !l.duplicado_de
    ).length,
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
          max_paginas: campana.max_paginas || 3,
        },
      });
      alert('Tarea de scraping creada. El agente la ejecutará en breve.');
    } catch (err) {
      alert('Error creando tarea: ' + err.message);
    }
    setActionLoading('');
  };

  const handleSendWA = () => {
    // Elegibles: móviles válidos, no duplicados cross-campaña.
    // NO filtramos por estado — mostramos todos y dejamos que el usuario
    // seleccione. Los que ya están enviados/respondidos/convertidos
    // aparecen sin check por defecto.
    const elegibles = leads.filter(l =>
      tipoTelefono(l.telefono) === 'movil' && !l.duplicado_de
    );
    if (elegibles.length === 0) {
      alert('No hay leads con teléfono móvil válido para enviar por WhatsApp.');
      return;
    }
    if (!agentStatus?.whatsapp_connected) {
      alert('WhatsApp no está conectado. Abre el agente y escanea el QR.');
      return;
    }
    setWaSelectModal({ leads: elegibles, tipo: 'inicial' });
  };

  const confirmSendWA = async (selectedLeads) => {
    if (selectedLeads.length === 0) {
      setWaSelectModal(null);
      return;
    }
    setActionLoading('wa_send');
    try {
      await captacionApi.createTarea({
        tipo: 'whatsapp_send',
        payload: {
          campana_id: campana.id,
          leads: selectedLeads,
          plantilla_mensaje: campana.plantilla_mensaje,
        },
      });
      setWaSelectModal(null);
      alert(`Tarea creada para enviar WhatsApp a ${selectedLeads.length} leads.`);
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
      tipoTelefono(l.telefono) === 'movil' &&
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
            {campana.portal} · {campana.tipo} · {campana.poblacion || campana.provincia || '—'}
          </p>
        </div>
        <button
          onClick={() => onEditCampana && onEditCampana(campana)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-medium rounded-lg"
          title="Editar campaña y plantillas de mensaje"
        >
          <Pencil size={12} /> Editar campaña
        </button>
        <Badge color={ESTADO_CAMPANA_COLORS[campana.estado] || 'gray'}>
          {campana.estado}
        </Badge>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 sm:gap-3 mb-4">
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

      {/* Avisos de deduplicación */}
      {(stats.duplicados > 0 || stats.con_proveedor > 0) && (
        <div className="flex flex-wrap gap-3 mb-4 text-xs">
          {stats.duplicados > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg">
              <span className="font-semibold">{stats.duplicados}</span> leads con teléfono ya contactado en otra campaña (se excluyen del envío automático)
            </span>
          )}
          {stats.con_proveedor > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg">
              <span className="font-semibold">{stats.con_proveedor}</span> leads coinciden con un proveedor existente
            </span>
          )}
        </div>
      )}

      {/* Acciones */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {activeTask ? (
          <button
            onClick={handlePauseScrape}
            disabled={actionLoading === 'pause'}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            title="Parar el scraping en curso"
          >
            <Pause size={14} />
            {actionLoading === 'pause'
              ? 'Pausando...'
              : activeTask.estado === 'en_proceso'
                ? 'Pausar scraping en curso'
                : 'Cancelar tarea pendiente'}
          </button>
        ) : (
          <button
            onClick={handleScrape}
            disabled={actionLoading === 'scrape'}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            <Search size={14} />
            {actionLoading === 'scrape' ? 'Creando tarea...' : 'Iniciar scraping'}
          </button>
        )}
        <button
          onClick={handleSendWA}
          disabled={actionLoading === 'wa_send'}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
        >
          <MessageSquare size={14} />
          {actionLoading === 'wa_send' ? 'Creando tarea...' : `Enviar WhatsApp a nuevos (${stats.nuevos_movil} móviles)`}
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

      {waSelectModal && (
        <WhatsAppSelectModal
          leads={waSelectModal.leads}
          onClose={() => setWaSelectModal(null)}
          onConfirm={confirmSendWA}
          loading={actionLoading === 'wa_send'}
        />
      )}
    </div>
  );
}

// ─── Modal: seleccionar leads antes de enviar WhatsApp ───────────────────────
function WhatsAppSelectModal({ leads, onClose, onConfirm, loading }) {
  // Por defecto: marcar los "nuevos" (no enviados) y no-duplicados.
  // Los que ya están en 'enviado' / 'respondido' / 'convertido' empiezan
  // desmarcados para no contactarlos dos veces.
  const [selected, setSelected] = useState(() => {
    const set = new Set();
    for (const l of leads) {
      if (l.estado === 'nuevo' && !l.duplicado_de) set.add(l.id);
    }
    return set;
  });

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map(l => l.id)));
    }
  };

  const countNuevos = leads.filter(l => l.estado === 'nuevo').length;
  const countYaEnviados = leads.filter(l => l.estado !== 'nuevo').length;
  const selectedArr = leads.filter(l => selected.has(l.id));

  return (
    <Modal isOpen={true} onClose={onClose} title="Enviar WhatsApp — Selecciona los leads" size="lg">
      <div className="space-y-3">
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          Marca los leads a los que quieres enviar mensaje. Los que ya tienen
          un WhatsApp enviado ({countYaEnviados}) aparecen <strong>sin marcar</strong> para no
          contactarlos dos veces. Pulsa en el check de la columna "WhatsApp"
          de la tabla si quieres marcar/desmarcar manualmente que a alguien
          se le ha enviado ya.
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">
            <strong>{selected.size}</strong> de {leads.length} seleccionados
          </span>
          <button
            onClick={toggleAll}
            className="text-xs text-blue-600 hover:text-blue-700"
          >
            {selected.size === leads.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wide">
                <th className="p-2 w-8"></th>
                <th className="p-2">Vendedor</th>
                <th className="p-2">Teléfono</th>
                <th className="p-2">Estado</th>
                <th className="p-2 text-center">WA</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => {
                const yaEnviado = lead.estado !== 'nuevo';
                return (
                  <tr
                    key={lead.id}
                    className={`border-t border-gray-100 hover:bg-gray-50 cursor-pointer ${yaEnviado ? 'bg-gray-50/50' : ''}`}
                    onClick={() => toggle(lead.id)}
                  >
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selected.has(lead.id)}
                        onChange={() => toggle(lead.id)}
                        onClick={e => e.stopPropagation()}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="p-2 font-medium text-gray-800">
                      {lead.nombre_vendedor || '—'}
                    </td>
                    <td className="p-2 font-mono text-xs text-gray-600">{lead.telefono}</td>
                    <td className="p-2">
                      <Badge color={ESTADO_LEAD_COLORS[lead.estado] || 'gray'}>
                        {ESTADO_LEAD_LABELS[lead.estado] || lead.estado}
                      </Badge>
                    </td>
                    <td className="p-2 text-center">
                      {yaEnviado ? (
                        <span className="text-green-500 font-semibold" title="Ya se le envió WhatsApp">✓</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(selectedArr)}
            disabled={loading || selected.size === 0}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50"
          >
            {loading ? 'Enviando…' : `Enviar a ${selected.size} leads`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function Captacion() {
  const { campanaId } = useParams();
  const navigate = useNavigate();

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
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);
  const [plantillasOpen, setPlantillasOpen] = useState(false);

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

  // Si la URL tiene campanaId (ej. /captacion/abc-123), cargar esa campaña
  // automáticamente. Así al refrescar no se pierde la vista de detalle.
  useEffect(() => {
    if (campanaId && !selectedCampana) {
      captacionApi.getCampana(campanaId)
        .then(setSelectedCampana)
        .catch(() => navigate('/captacion', { replace: true }));
    } else if (!campanaId) {
      setSelectedCampana(null);
    }
  }, [campanaId]); // eslint-disable-line react-hooks/exhaustive-deps

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
      <div className="max-w-6xl mx-auto">
        <CampanaDetail
          campana={selectedCampana}
          onBack={() => { navigate('/captacion'); loadCampanas(); loadAllLeads(); }}
          onRefresh={loadCampanas}
          onEditLead={handleEditLead}
          onDeleteLead={async (id) => { await captacionApi.deleteLead(id); }}
          onEditCampana={(c) => { setEditing(c); setModal(true); }}
          agentStatus={agentStatus}
        />
        <LeadEditModal
          open={editLeadModal}
          onClose={() => setEditLeadModal(false)}
          lead={editingLead}
          onSaved={handleLeadSaved}
        />
        {/* Modal editar campaña (se puede abrir desde el botón de la cabecera) */}
        <CampanaModal
          open={modal}
          onClose={() => setModal(false)}
          editing={editing}
          onSaved={(updated) => {
            handleSaved(updated);
            // Refrescar la campaña seleccionada si es la que se estaba editando
            if (updated && selectedCampana && updated.id === selectedCampana.id) {
              // Recargar para ver los cambios en la plantilla
              loadCampanas();
            }
          }}
          onSaveAndScrape={handleSaveAndScrape}
        />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Captación</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Scraping automático y contacto por WhatsApp</p>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-3 flex-wrap">
          <AgentStatusBar status={agentStatus} onRefresh={loadAgentStatus} onOpenSetup={() => setAgentSetupOpen(true)} />
          <button
            onClick={() => setPlantillasOpen(true)}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-sm font-medium whitespace-nowrap"
            title="Gestionar plantillas de mensajes"
          >
            📝 Plantillas
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium whitespace-nowrap"
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
          <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Portal</th>
                  <th className="px-4 py-3 font-medium">Ubicación</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
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
                    onClick={() => navigate(`/captacion/${c.id}`)}
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">{c.nombre}</td>
                    <td className="px-4 py-3 capitalize text-gray-600">{c.portal}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {c.poblacion || c.provincia || '—'}
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-600">{c.tipo}</td>
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

      {/* Modal de configuración del agente */}
      <AgentSetupModal
        open={agentSetupOpen}
        onClose={() => setAgentSetupOpen(false)}
        agentStatus={agentStatus}
      />

      {/* Modal de plantillas */}
      <PlantillasModal
        open={plantillasOpen}
        onClose={() => setPlantillasOpen(false)}
      />
    </div>
  );
}
