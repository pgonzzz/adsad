import { useState, useEffect, useCallback } from 'react';
import { FileSignature, Download, Trash2, Plus } from 'lucide-react';
import { contratosApi } from '../api';
import { UploadFirmadoModal } from '../pages/Contratos';
import ConfirmDialog from './ConfirmDialog';
import { useToast } from './Toast';
import useContratosAccess from '../hooks/useContratosAccess';

/**
 * Sección embebida de "Contratos" para ser insertada dentro de una ficha de
 * Inversor o de Proveedor. Lista los contratos firmados asociados a esa
 * entidad y permite añadir/eliminar.
 *
 * Sólo se renderiza si el usuario actual tiene acceso al módulo. Si no, es
 * null (invisible).
 *
 * Props:
 *   inversorId?: string
 *   proveedorId?: string
 *   (se debe pasar uno u otro, no los dos)
 */
export default function ContratosSection({ inversorId = null, proveedorId = null }) {
  const toast = useToast();
  const hasAccess = useContratosAccess();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDlg, setConfirmDlg] = useState(null);

  const load = useCallback(() => {
    if (!hasAccess) return;
    setLoading(true);
    const params = inversorId ? { inversor_id: inversorId } : { proveedor_id: proveedorId };
    contratosApi.getFirmados(params)
      .then(setItems)
      .finally(() => setLoading(false));
  }, [hasAccess, inversorId, proveedorId]);

  useEffect(load, [load]);

  if (hasAccess !== true) return null;

  const handleDelete = (c) => {
    setConfirmDlg({
      title: 'Eliminar contrato',
      message: `¿Seguro que quieres eliminar "${c.nombre}"?`,
      onConfirm: async () => {
        try {
          await contratosApi.deleteFirmado(c.id);
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Contratos</h2>
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={14} /> Añadir contrato
        </button>
      </div>

      {loading ? (
        <div className="px-6 py-6 text-center text-sm text-gray-400">Cargando…</div>
      ) : items.length === 0 ? (
        <p className="text-center py-8 text-gray-400 text-sm">Sin contratos todavía</p>
      ) : (
        <div className="divide-y">
          {items.map(c => (
            <div key={c.id} className="px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <FileSignature size={16} className="text-gray-400 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-gray-900 truncate">{c.nombre}</div>
                  <div className="text-xs text-gray-500">
                    {new Date(c.created_at).toLocaleDateString('es-ES')}
                    {c.plantilla?.nombre && <span> · Generado desde "{c.plantilla.nombre}"</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => contratosApi.downloadFirmado(c.id, c.archivo_nombre_original || c.nombre)}
                  className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"
                  title="Descargar"
                >
                  <Download size={14} />
                </button>
                <button
                  onClick={() => handleDelete(c)}
                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"
                  title="Eliminar"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadFirmadoModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUploaded={() => { setUploadOpen(false); load(); }}
        inversorId={inversorId}
        proveedorId={proveedorId}
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
