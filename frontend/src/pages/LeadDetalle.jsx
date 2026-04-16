import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, ExternalLink, MapPin, Building2, Clock, Plus,
  Pencil, Trash2, Check, UserPlus, Send, Bell, Loader2,
} from 'lucide-react';
import { captacionApi, proveedoresApi, propiedadesApi, recordatoriosApi } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import NotesTimeline from '../components/NotesTimeline';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';

const ESTADO_LEAD_COLORS = {
  nuevo: 'blue', enviado: 'amber', respondido: 'green', descartado: 'red', convertido: 'purple',
};
const ESTADO_LEAD_LABELS = {
  nuevo: 'Nuevo', enviado: 'Enviado', respondido: 'Respondido', descartado: 'Descartado', convertido: 'Convertido',
};

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function LeadDetalle() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState(null);
  const [convertirModal, setConvertirModal] = useState(false);
  const [reminderModal, setReminderModal] = useState(false);

  const load = () => {
    setLoading(true);
    captacionApi.getLeadById(leadId).then(setLead).finally(() => setLoading(false));
  };
  useEffect(load, [leadId]);

  if (loading) return <LoadingSpinner />;
  if (!lead) return <p className="text-red-500 text-sm">Lead no encontrado</p>;

  const ubicacion = [lead.poblacion, lead.provincia].filter(Boolean).join(', ');

  // Parsear características
  const car = lead.caracteristicas || {};
  const carItems = Object.entries(car).flatMap(([section, items]) =>
    (items || []).map(item => ({ section, item }))
  );

  return (
    <div>
      <Link to="/captacion" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={14} /> Captación
      </Link>

      {/* ── Cabecera ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              <h1 className="text-xl font-bold text-gray-900">{lead.nombre_vendedor || 'Lead sin nombre'}</h1>
              <Badge color={ESTADO_LEAD_COLORS[lead.estado]}>
                {ESTADO_LEAD_LABELS[lead.estado] || lead.estado}
              </Badge>
              {lead.es_particular === false && (
                <span className="text-xs text-gray-400">(agencia)</span>
              )}
            </div>
            {ubicacion && (
              <p className="text-gray-500 text-sm mb-2 flex items-center gap-1">
                <MapPin size={13} className="text-gray-400" /> {ubicacion}
              </p>
            )}
            <div className="flex flex-wrap gap-4 text-sm">
              {lead.telefono && (
                <a href={`tel:${lead.telefono}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                  <Phone size={13} /> {lead.telefono}
                </a>
              )}
              {lead.precio && (
                <span className="text-gray-700 font-medium">{fmt(lead.precio)}</span>
              )}
              {lead.url_anuncio && (
                <a href={lead.url_anuncio} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                  <ExternalLink size={13} /> Ver anuncio
                </a>
              )}
            </div>
            {lead.captacion_campanas && (
              <p className="text-xs text-gray-400 mt-2">
                Campaña: {lead.captacion_campanas.nombre} · {lead.captacion_campanas.portal}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {lead.estado !== 'convertido' && (
              <button
                onClick={() => setConvertirModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg"
              >
                <UserPlus size={12} /> Convertir en proveedor
              </button>
            )}
            <select
              value={lead.estado}
              onChange={async (e) => {
                const updated = await captacionApi.updateLead(leadId, { estado: e.target.value });
                setLead(l => ({ ...l, ...updated }));
                toast.success('Estado actualizado');
              }}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs"
            >
              {Object.entries(ESTADO_LEAD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* ── Características ── */}
        {carItems.length > 0 && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Características</h2>
            <div className="space-y-3">
              {Object.entries(car).map(([section, items]) => (
                <div key={section}>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">{section}</p>
                  <div className="flex flex-wrap gap-2">
                    {(items || []).map((item, i) => (
                      <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{item}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recordatorios ── */}
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${carItems.length === 0 ? 'lg:col-span-3' : ''}`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Bell size={16} className="text-amber-500" /> Recordatorios
            </h2>
            <button
              onClick={() => setReminderModal(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-lg"
            >
              <Plus size={12} /> Añadir
            </button>
          </div>
          {(lead.recordatorios || []).length === 0 ? (
            <p className="text-sm text-gray-400">Sin recordatorios.</p>
          ) : (
            <div className="space-y-2">
              {(lead.recordatorios || []).map(r => (
                <div
                  key={r.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
                    r.estado === 'disparado' ? 'bg-amber-50 border-amber-200' :
                    r.estado === 'completado' ? 'bg-gray-50 border-gray-200 opacity-60' :
                    'bg-white border-gray-200'
                  }`}
                >
                  <Clock size={14} className={r.estado === 'disparado' ? 'text-amber-500 mt-0.5' : 'text-gray-400 mt-0.5'} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{r.titulo}</p>
                    {r.descripcion && <p className="text-xs text-gray-500">{r.descripcion}</p>}
                    <p className="text-xs text-gray-400 mt-1">{fmtDate(r.fecha_hora)}</p>
                  </div>
                  {r.estado !== 'completado' && (
                    <button
                      onClick={async () => {
                        await recordatoriosApi.update(r.id, { estado: 'completado' });
                        load();
                        toast.success('Recordatorio completado');
                      }}
                      className="text-gray-400 hover:text-green-600 p-1"
                      title="Marcar como completado"
                    >
                      <Check size={14} />
                    </button>
                  )}
                  <button
                    onClick={async () => {
                      await recordatoriosApi.delete(r.id);
                      load();
                    }}
                    className="text-gray-400 hover:text-red-500 p-1"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── WhatsApp enviados ── */}
      {(lead.envios || []).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Send size={16} className="text-green-500" /> Mensajes enviados
          </h2>
          <div className="space-y-3">
            {(lead.envios || []).map(e => {
              const ackMap = {
                enviado: { text: '✓', color: 'text-gray-400' },
                entregado: { text: '✓✓', color: 'text-gray-500' },
                leido: { text: '✓✓', color: 'text-blue-500 font-semibold' },
              };
              const ack = ackMap[e.ack_status] || ackMap.enviado;
              return (
                <div key={e.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1 text-xs text-gray-400">
                    <span>{e.tipo === 'followup' ? '🔔 Follow-up' : '💬 Inicial'} · {fmtDate(e.created_at)}</span>
                    <span className={ack.color}>{ack.text}</span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{e.mensaje || '(sin contenido)'}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Notas / Timeline ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-5">
        <h2 className="font-semibold text-gray-900 mb-4">Notas</h2>
        <NotesTimeline
          comentarios={lead.comentarios || []}
          onSave={async (nueva) => {
            await captacionApi.updateLead(leadId, { comentarios: nueva });
            setLead(l => ({ ...l, comentarios: nueva }));
          }}
        />
      </div>

      {/* ── Modal: Convertir en proveedor + propiedad ── */}
      {convertirModal && (
        <ConvertirModal
          lead={lead}
          onClose={() => setConvertirModal(false)}
          onConverted={() => { setConvertirModal(false); load(); toast.success('Lead convertido en proveedor + propiedad'); }}
        />
      )}

      {/* ── Modal: Nuevo recordatorio ── */}
      {reminderModal && (
        <ReminderModal
          entidad="lead"
          entidadId={leadId}
          onClose={() => setReminderModal(false)}
          onCreated={() => { setReminderModal(false); load(); toast.success('Recordatorio creado'); }}
        />
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

// ─── Modal: Convertir lead → Proveedor + Propiedad ──────────────────────────
function ConvertirModal({ lead, onClose, onConverted }) {
  const [form, setForm] = useState({
    tipo: lead.es_particular === false ? 'inmobiliaria' : 'propietario',
    nombre: lead.nombre_vendedor || '',
    telefono: lead.telefono || '',
    email: '',
    empresa: '',
    notas: lead.notas || '',
  });
  const [crearPropiedad, setCrearPropiedad] = useState(true);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Parsear m², habs, baños de características
  const car = lead.caracteristicas?.['Características básicas'] || lead.caracteristicas?.['características básicas'] || [];
  const m2Match = car.find(c => /m²/.test(c));
  const m2 = m2Match ? parseInt(m2Match.replace(/[^\d]/g, ''), 10) || null : null;
  const habsMatch = car.find(c => /habitaci/i.test(c));
  const habs = habsMatch ? parseInt(habsMatch.replace(/[^\d]/g, ''), 10) || null : null;
  const banosMatch = car.find(c => /baño/i.test(c));
  const banos = banosMatch ? parseInt(banosMatch.replace(/[^\d]/g, ''), 10) || null : null;

  const handleSave = async () => {
    setSaving(true);
    try {
      // 1. Crear proveedor
      const proveedor = await proveedoresApi.create(form);

      // 2. Crear propiedad si el usuario lo quiere
      if (crearPropiedad) {
        await propiedadesApi.create({
          tipo: lead.tipo || 'piso',
          provincia: lead.provincia || '',
          poblacion: lead.poblacion || '',
          precio: lead.precio || null,
          m2, habitaciones: habs, banos,
          proveedor_id: proveedor.id,
          descripcion: lead.titulo || '',
          estado: 'disponible',
          notas: `Importado desde captación. URL: ${lead.url_anuncio || ''}`,
        });
      }

      // 3. Marcar lead como convertido
      await captacionApi.updateLead(lead.id, { estado: 'convertido' });
      onConverted();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <Modal isOpen onClose={onClose} title="Convertir en proveedor" size="lg">
      <div className="space-y-4">
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
          Se creará un <strong>proveedor</strong> con los datos del lead.
          {crearPropiedad && ' También se creará una <strong>propiedad</strong> en el CRM con los datos del anuncio.'}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={form.tipo} onChange={set('tipo')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="propietario">Propietario</option>
              <option value="inmobiliaria">Inmobiliaria</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input required value={form.nombre} onChange={set('nombre')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
            <input value={form.telefono} onChange={set('telefono')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" value={form.email} onChange={set('email')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={crearPropiedad}
            onChange={e => setCrearPropiedad(e.target.checked)} />
          <span className="text-sm text-gray-700">
            También crear <strong>propiedad</strong> en el CRM
            {lead.precio ? ` (${fmt(lead.precio)}, ${lead.tipo || 'piso'})` : ''}
          </span>
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !form.nombre}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            <UserPlus size={14} /> {saving ? 'Convirtiendo...' : 'Convertir'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: Crear recordatorio ──────────────────────────────────────────────
function ReminderModal({ entidad, entidadId, onClose, onCreated }) {
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('10:00');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!titulo || !fecha) return;
    setSaving(true);
    try {
      await recordatoriosApi.create({
        entidad,
        entidad_id: entidadId,
        titulo,
        descripcion,
        fecha_hora: new Date(`${fecha}T${hora}`).toISOString(),
      });
      onCreated();
    } catch (err) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  };

  return (
    <Modal isOpen onClose={onClose} title="Nuevo recordatorio" size="sm">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
          <input value={titulo} onChange={e => setTitulo(e.target.value)}
            placeholder="Ej: Llamar al propietario"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hora</label>
            <input type="time" value={hora} onChange={e => setHora(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !titulo || !fecha}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {saving ? 'Creando...' : 'Crear recordatorio'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
