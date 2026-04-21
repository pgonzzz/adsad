import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Trash2, Plus, FileSignature, Upload } from 'lucide-react';
import { contratosApi, inversoresApi, proveedoresApi } from '../api';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';

const TABS = [
  { key: 'plantillas', label: 'Plantillas' },
  { key: 'firmados',   label: 'Contratos firmados' },
];

export default function Contratos() {
  const [tab, setTab] = useState('plantillas');
  return (
    <div>
      <div className="flex items-center justify-between mb-4 sm:mb-6 gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Contratos</h1>
      </div>
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'plantillas' ? <PlantillasTab /> : <FirmadosTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLAS
// ═══════════════════════════════════════════════════════════════════════════

function PlantillasTab() {
  const toast = useToast();
  const [plantillas, setPlantillas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [useTemplate, setUseTemplate] = useState(null); // plantilla a usar
  const [confirmDlg, setConfirmDlg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    contratosApi.getPlantillas()
      .then(setPlantillas)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = (p) => {
    setConfirmDlg({
      title: 'Eliminar plantilla',
      message: `¿Seguro que quieres eliminar "${p.nombre}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await contratosApi.deletePlantilla(p.id);
          toast.success('Plantilla eliminada');
          load();
        } catch (err) {
          toast.error('Error: ' + (err.response?.data?.error || err.message));
        }
        setConfirmDlg(null);
      },
    });
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Upload size={16} /> Subir plantilla (.docx)
        </button>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : plantillas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-400">
          <FileText size={40} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">Aún no hay plantillas. Sube una plantilla .docx con placeholders tipo <code className="bg-gray-100 px-1 rounded">{'{{campo}}'}</code> para empezar.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plantillas.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-col">
              <div className="flex items-start gap-3 mb-3">
                <div className="p-2 bg-blue-50 rounded-lg shrink-0">
                  <FileText size={20} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{p.nombre}</h3>
                  {p.descripcion && (
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{p.descripcion}</p>
                  )}
                </div>
              </div>
              <div className="text-xs text-gray-500 mb-3">
                <span className="font-medium">{(p.campos || []).length}</span> campos detectados
                {p.creado_por && <span> · por {p.creado_por}</span>}
              </div>
              <div className="flex gap-2 mt-auto pt-3 border-t border-gray-100">
                <button
                  onClick={() => setUseTemplate(p)}
                  className="flex-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700"
                >
                  Usar
                </button>
                <button
                  onClick={() => contratosApi.downloadPlantilla(p.id, p.nombre)}
                  className="px-2 py-1.5 text-gray-600 hover:bg-gray-100 rounded-md"
                  title="Descargar original"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => handleDelete(p)}
                  className="px-2 py-1.5 text-red-500 hover:bg-red-50 rounded-md"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadPlantillaModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { setUploadOpen(false); load(); }}
      />

      <UsePlantillaModal
        plantilla={useTemplate}
        onClose={() => setUseTemplate(null)}
      />

      <ConfirmDialog
        open={!!confirmDlg}
        title={confirmDlg?.title}
        message={confirmDlg?.message}
        onConfirm={confirmDlg?.onConfirm}
        onCancel={() => setConfirmDlg(null)}
      />
    </div>
  );
}

function UploadPlantillaModal({ open, onClose, onUploaded }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const reset = () => { setNombre(''); setDescripcion(''); setFile(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      await contratosApi.createPlantilla({ nombre, descripcion, file });
      toast.success('Plantilla subida');
      reset();
      onUploaded();
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} title="Subir plantilla" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
          <input
            required
            value={nombre}
            onChange={e => setNombre(e.target.value)}
            placeholder="ej: Contrato de mandato de venta"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea
            rows={2}
            value={descripcion}
            onChange={e => setDescripcion(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Archivo .docx *</label>
          <input
            required
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            En el Word, usa <code className="bg-gray-100 px-1 rounded">{'{{nombre_campo}}'}</code> donde quieras que se rellene un dato.
          </p>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={onClose} disabled={uploading}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={uploading || !file}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {uploading ? 'Subiendo…' : 'Subir'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Modal que muestra el formulario dinámico con los campos detectados en la
// plantilla, genera el .docx relleno y lo descarga.
function UsePlantillaModal({ plantilla, onClose }) {
  const toast = useToast();
  const [valores, setValores] = useState({});
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (plantilla) {
      // Inicializar valores vacíos para cada campo
      const init = {};
      (plantilla.campos || []).forEach(c => { init[c] = ''; });
      setValores(init);
    }
  }, [plantilla]);

  if (!plantilla) return null;

  const handleGenerate = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      await contratosApi.generateFromPlantilla(plantilla.id, valores, plantilla.nombre);
      toast.success('Contrato generado');
      onClose();
    } catch (err) {
      const raw = err.response?.data;
      const msg = raw instanceof Blob
        ? await raw.text().then(t => { try { return JSON.parse(t).error; } catch { return t; } })
        : raw?.error || err.message;
      toast.error('Error: ' + msg);
    } finally {
      setGenerating(false);
    }
  };

  const campos = plantilla.campos || [];

  return (
    <Modal isOpen={!!plantilla} onClose={onClose} title={`Generar: ${plantilla.nombre}`} size="lg">
      <form onSubmit={handleGenerate} className="space-y-4">
        {campos.length === 0 ? (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Esta plantilla no tiene campos <code className="bg-amber-100 px-1 rounded">{'{{...}}'}</code> detectados.
            Se generará tal cual.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {campos.map(campo => (
              <div key={campo}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{campo}</label>
                <input
                  value={valores[campo] || ''}
                  onChange={e => setValores(v => ({ ...v, [campo]: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        )}
        <div className="text-xs text-gray-500">
          Se descargará un <strong>.docx</strong> relleno. Si quieres que quede guardado en el CRM, súbelo
          a "Contratos firmados" una vez firmado.
        </div>
        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} disabled={generating}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={generating}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {generating ? 'Generando…' : 'Generar y descargar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FIRMADOS
// ═══════════════════════════════════════════════════════════════════════════

function FirmadosTab() {
  const toast = useToast();
  const [firmados, setFirmados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    contratosApi.getFirmados()
      .then(setFirmados)
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const handleDelete = (f) => {
    setConfirmDlg({
      title: 'Eliminar contrato',
      message: `¿Seguro que quieres eliminar "${f.nombre}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        try {
          await contratosApi.deleteFirmado(f.id);
          toast.success('Contrato eliminado');
          load();
        } catch (err) {
          toast.error('Error: ' + (err.response?.data?.error || err.message));
        }
        setConfirmDlg(null);
      },
    });
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={16} /> Subir contrato firmado
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Asociado a</th>
                <th className="px-4 py-3">Plantilla</th>
                <th className="px-4 py-3">Creado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              ) : firmados.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400">Sin contratos firmados</td></tr>
              ) : firmados.map(f => (
                <tr key={f.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileSignature size={14} className="text-gray-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{f.nombre}</div>
                        {f.descripcion && <div className="text-xs text-gray-500 truncate">{f.descripcion}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {f.inversor?.nombre ? <span>Inversor · {f.inversor.nombre}</span> :
                     f.proveedor?.nombre ? <span>Proveedor · {f.proveedor.nombre}</span> :
                     <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{f.plantilla?.nombre || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(f.created_at).toLocaleDateString('es-ES')}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => contratosApi.downloadFirmado(f.id, f.archivo_nombre_original || f.nombre)}
                      className="text-gray-500 hover:text-gray-800" title="Descargar">
                      <Download size={14} />
                    </button>
                    <button onClick={() => handleDelete(f)} className="text-red-400 hover:text-red-600" title="Eliminar">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <UploadFirmadoModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { setUploadOpen(false); load(); }}
      />

      <ConfirmDialog
        open={!!confirmDlg}
        title={confirmDlg?.title}
        message={confirmDlg?.message}
        onConfirm={confirmDlg?.onConfirm}
        onCancel={() => setConfirmDlg(null)}
      />
    </div>
  );
}

// Modal reutilizable para subir contratos firmados. Si se le pasa inversorId
// o proveedorId, queda pre-asociado a esa entidad (usado también desde las
// fichas de inversor/proveedor).
export function UploadFirmadoModal({ open, onClose, onUploaded, inversorId = null, proveedorId = null }) {
  const toast = useToast();
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [file, setFile] = useState(null);
  const [assocTipo, setAssocTipo] = useState(
    inversorId ? 'inversor' : proveedorId ? 'proveedor' : 'ninguno'
  );
  const [assocId, setAssocId] = useState(inversorId || proveedorId || '');
  const [options, setOptions] = useState({ inversores: [], proveedores: [] });
  const [uploading, setUploading] = useState(false);

  // Pre-fija selección si la modal viene desde una ficha
  useEffect(() => {
    if (open) {
      if (inversorId) { setAssocTipo('inversor'); setAssocId(inversorId); }
      else if (proveedorId) { setAssocTipo('proveedor'); setAssocId(proveedorId); }
    }
  }, [open, inversorId, proveedorId]);

  // Cargar listas solo si el selector está libre (sin preselección forzada)
  useEffect(() => {
    if (open && !inversorId && !proveedorId) {
      Promise.all([inversoresApi.getAll(), proveedoresApi.getAll()])
        .then(([invs, provs]) => setOptions({ inversores: invs || [], proveedores: provs || [] }))
        .catch(() => {});
    }
  }, [open, inversorId, proveedorId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const payload = {
        nombre,
        descripcion,
        file,
        inversor_id: assocTipo === 'inversor' ? assocId : null,
        proveedor_id: assocTipo === 'proveedor' ? assocId : null,
      };
      await contratosApi.createFirmado(payload);
      toast.success('Contrato subido');
      setNombre(''); setDescripcion(''); setFile(null);
      onUploaded();
    } catch (err) {
      toast.error('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setUploading(false);
    }
  };

  const isForced = !!(inversorId || proveedorId);

  return (
    <Modal isOpen={open} onClose={onClose} title="Subir contrato firmado" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
          <input required value={nombre} onChange={e => setNombre(e.target.value)}
            placeholder="ej: Contrato de mandato — Juan Pérez"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
          <textarea rows={2} value={descripcion} onChange={e => setDescripcion(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {!isForced && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Asociar a</label>
              <select value={assocTipo}
                onChange={e => { setAssocTipo(e.target.value); setAssocId(''); }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="ninguno">Ninguno</option>
                <option value="inversor">Inversor</option>
                <option value="proveedor">Proveedor</option>
              </select>
            </div>
            {assocTipo !== 'ninguno' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {assocTipo === 'inversor' ? 'Inversor' : 'Proveedor'}
                </label>
                <select required value={assocId} onChange={e => setAssocId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Selecciona…</option>
                  {(assocTipo === 'inversor' ? options.inversores : options.proveedores).map(o => (
                    <option key={o.id} value={o.id}>{o.nombre}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Archivo *</label>
          <input required type="file" accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={e => setFile(e.target.files?.[0] || null)}
            className="w-full text-sm" />
          <p className="text-xs text-gray-500 mt-1">PDF o DOCX recomendado.</p>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onClose} disabled={uploading}
            className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={uploading || !file}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {uploading ? 'Subiendo…' : 'Subir'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
