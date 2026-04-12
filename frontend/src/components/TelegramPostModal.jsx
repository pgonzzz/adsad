import { useState, useEffect } from 'react';
import { Send, Clock, Loader2, Check, X, ImagePlus } from 'lucide-react';
import Modal from './Modal';
import { telegramApi } from '../api';
import { useToast } from './Toast';

function fmtEUR(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Genera el texto de publicación para Telegram a partir de los datos
 * de una propiedad. Sigue el formato del ejemplo del usuario.
 */
function generateTelegramText(p) {
  const ubicacion = [p.poblacion, p.provincia].filter(Boolean).join(', ');
  const tipo = (p.tipo || 'piso').charAt(0).toUpperCase() + (p.tipo || 'piso').slice(1);

  const lines = [];

  // Cabecera
  lines.push(`🔥 NUEVA OPORTUNIDAD DE INVERSIÓN`);
  lines.push('');
  lines.push(`📍 ${tipo} en ${ubicacion || 'ubicación por determinar'}`);
  if (p.direccion) lines.push(`📌 ${p.direccion}`);
  lines.push('');

  // Precio y rentabilidad
  lines.push('━━━━━━━━━━━━━━━');
  lines.push(`💸 Precio compra: ${fmtEUR(p.precio)}`);
  if (p.rentabilidad_bruta) {
    lines.push(`📈 Rentabilidad bruta: ${p.rentabilidad_bruta}%`);
  }
  if (p.rentabilidad_neta) {
    lines.push(`📊 Rentabilidad neta: ${p.rentabilidad_neta}%`);
  }
  if (p.precio && p.m2) {
    lines.push(`💰 Precio/m²: ${Math.round(p.precio / p.m2).toLocaleString('es-ES')} €`);
  }
  lines.push('');

  // Características
  const specs = [
    p.m2 && `📏 ${p.m2} m²`,
    p.habitaciones && `🛏 ${p.habitaciones} habitaciones`,
    p.banos && `🛁 ${p.banos} baños`,
    p.planta && `🏢 Planta ${p.planta}`,
    p.anio_construccion && `📅 Año ${p.anio_construccion}`,
  ].filter(Boolean);

  if (specs.length > 0) {
    lines.push('━━━━━━━━━━━━━━━');
    lines.push('🏠 Características del activo');
    specs.forEach((s) => lines.push(s));
    lines.push('');
  }

  // Puntos fuertes
  lines.push('━━━━━━━━━━━━━━━');
  lines.push('🎯 Puntos fuertes');
  if (p.acepta_financiacion) lines.push('✔️ Acepta financiación');
  lines.push('✔️ Inversión con potencial de revalorización');
  lines.push('✔️ Zona con alta demanda');
  lines.push('');

  // Servicio
  lines.push('━━━━━━━━━━━━━━━');
  lines.push('🧠 Servicio opcional');
  lines.push('✔️ Gestión integral del alquiler');
  lines.push('✔️ Compra 100% a distancia');
  lines.push('✔️ Acompañamiento completo');
  lines.push('');

  // Contacto
  lines.push('━━━━━━━━━━━━━━━');
  lines.push('📩 Solicita información');
  lines.push('✉️ Carles@pisalia.es');
  lines.push('');
  lines.push('⏳ Este tipo de activos vuelan');

  return lines.join('\n');
}

/**
 * Modal para publicar una propiedad en el grupo de Telegram.
 *
 * Props:
 *   isOpen     : boolean
 *   onClose    : () => void
 *   propiedad  : objeto propiedad completo
 *   onPublished: () => void (callback tras publicar ok)
 */
export default function TelegramPostModal({ isOpen, onClose, propiedad, onPublished }) {
  const toast = useToast();
  const [texto, setTexto] = useState('');
  const [selectedFotos, setSelectedFotos] = useState([]);
  const [mode, setMode] = useState('ahora'); // 'ahora' | 'programar'
  const [programDate, setProgramDate] = useState('');
  const [programTime, setProgramTime] = useState('');
  const [loading, setLoading] = useState(false);
  const [configOk, setConfigOk] = useState(null);
  const [generatingText, setGeneratingText] = useState(false);

  // Generar texto con IA y seleccionar fotos al abrir
  useEffect(() => {
    if (isOpen && propiedad) {
      // Texto temporal mientras la IA genera
      setTexto(generateTelegramText(propiedad));
      setSelectedFotos((propiedad.fotos || []).slice(0, 10));
      setMode('ahora');
      setProgramDate('');
      setProgramTime('');
      telegramApi.getConfig().then(setConfigOk).catch(() => setConfigOk({ configured: false }));

      // Generar texto inteligente con GPT-4o (analiza notas, descripción, calcula rentabilidades)
      setGeneratingText(true);
      telegramApi.generateText(propiedad)
        .then(r => { if (r.text) setTexto(r.text); })
        .catch(() => { /* silencioso — se queda con el texto template */ })
        .finally(() => setGeneratingText(false));
    }
  }, [isOpen, propiedad]);

  const toggleFoto = (url) => {
    setSelectedFotos((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url].slice(0, 10)
    );
  };

  const handlePublish = async () => {
    if (!texto.trim()) return;
    setLoading(true);
    try {
      const payload = {
        texto: texto.trim(),
        fotos: selectedFotos,
        propiedad_id: propiedad.id,
      };

      if (mode === 'ahora') {
        payload.publicar_ahora = true;
      } else {
        if (!programDate || !programTime) {
          toast.error('Selecciona fecha y hora para programar');
          setLoading(false);
          return;
        }
        payload.programado_para = new Date(`${programDate}T${programTime}`).toISOString();
      }

      const result = await telegramApi.createPost(payload);

      if (result.estado === 'publicado') {
        toast.success('Publicado en Telegram');
      } else if (result.estado === 'programado') {
        toast.success('Programado para publicar');
      } else if (result.estado === 'error') {
        toast.error('Error de Telegram: ' + (result.error_msg || 'desconocido'));
      }

      onPublished?.();
      onClose();
    } catch (err) {
      toast.error('Error: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const fotos = propiedad?.fotos || [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Publicar en Telegram" size="lg">
      {configOk && !configOk.configured && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          <strong>Configuración necesaria:</strong> Añade <code>TELEGRAM_BOT_TOKEN</code> y{' '}
          <code>TELEGRAM_CHAT_ID</code> como variables de entorno en el backend (Railway).
          {!configOk.has_token && <span className="block mt-1">Falta: TELEGRAM_BOT_TOKEN</span>}
          {!configOk.has_chat_id && <span className="block mt-1">Falta: TELEGRAM_CHAT_ID</span>}
        </div>
      )}

      <div className="space-y-4">
        {/* Texto editable */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-gray-700">
              Texto de la publicación
            </label>
            {generatingText && (
              <span className="flex items-center gap-1.5 text-xs text-blue-600">
                <Loader2 size={12} className="animate-spin" /> Generando con IA…
              </span>
            )}
          </div>
          <textarea
            rows={14}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono leading-relaxed resize-y"
          />
          <p className="text-xs text-gray-400 mt-1">
            {texto.length} caracteres · Puedes editar el texto libremente antes de publicar.
          </p>
        </div>

        {/* Selector de fotos */}
        {fotos.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fotos a incluir ({selectedFotos.length}/{fotos.length})
            </label>
            <div className="flex flex-wrap gap-2">
              {fotos.map((url) => {
                const selected = selectedFotos.includes(url);
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={() => toggleFoto(url)}
                    className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      selected
                        ? 'border-blue-500 ring-2 ring-blue-200'
                        : 'border-gray-200 opacity-50 hover:opacity-80'
                    }`}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    {selected && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Haz clic para seleccionar/deseleccionar. Máximo 10 fotos.
            </p>
          </div>
        )}

        {/* Modo: ahora o programar */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Cuándo publicar
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMode('ahora')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === 'ahora'
                  ? 'bg-blue-50 border-blue-400 text-blue-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Send size={14} /> Ahora
            </button>
            <button
              type="button"
              onClick={() => setMode('programar')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                mode === 'programar'
                  ? 'bg-blue-50 border-blue-400 text-blue-700'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Clock size={14} /> Programar
            </button>
          </div>

          {mode === 'programar' && (
            <div className="flex gap-3 mt-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Fecha</label>
                <input
                  type="date"
                  value={programDate}
                  onChange={(e) => setProgramDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Hora</label>
                <input
                  type="time"
                  value={programTime}
                  onChange={(e) => setProgramTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handlePublish}
            disabled={loading || !texto.trim() || (configOk && !configOk.configured)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {mode === 'ahora' ? 'Publicando…' : 'Programando…'}
              </>
            ) : mode === 'ahora' ? (
              <>
                <Send size={14} /> Publicar en Telegram
              </>
            ) : (
              <>
                <Clock size={14} /> Programar publicación
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
