import { useState, useEffect } from 'react';
import { Loader2, Send, Pencil, Trash2, Check, User2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * Timeline de notas/actividad reutilizable por cualquier entidad.
 *
 * Las notas se guardan como un array JSON en la propia entidad
 * ({ id, texto, usuario, email, created_at, editado_at }) y el padre
 * es quien decide cómo persistirlas — este componente solo gestiona
 * la UI y llama a `onSave(nuevaLista)` cuando cambia algo.
 *
 * Props:
 *   comentarios : array actual de notas
 *   onSave      : async (nuevaLista) => void
 *   onConfirm   : (title, message, cb) => void  (diálogo modal opcional)
 */
export default function NotesTimeline({ comentarios = [], onSave, onConfirm }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [nuevo, setNuevo] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { id, texto }
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUser(data.user);
    });
  }, []);

  const getUserName = () =>
    currentUser?.user_metadata?.full_name ||
    currentUser?.email?.split('@')[0] ||
    'Usuario';

  const handleAdd = async () => {
    const texto = nuevo.trim();
    if (!texto) return;
    setSaving(true);
    const nueva = {
      id: Date.now().toString(),
      texto,
      usuario: getUserName(),
      email: currentUser?.email || '',
      created_at: new Date().toISOString(),
    };
    await onSave([...(comentarios || []), nueva]);
    setNuevo('');
    setSaving(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd();
  };

  const handleStartEdit = (c) => setEditing({ id: c.id, texto: c.texto });
  const handleCancelEdit = () => setEditing(null);

  const handleSaveEdit = async () => {
    if (!editing?.texto.trim()) return;
    setSavingEdit(true);
    const nueva = (comentarios || []).map((c) =>
      c.id === editing.id
        ? { ...c, texto: editing.texto.trim(), editado_at: new Date().toISOString() }
        : c
    );
    await onSave(nueva);
    setEditing(null);
    setSavingEdit(false);
  };

  const handleDelete = (cId) => {
    const doDelete = async () => {
      const nueva = (comentarios || []).filter((c) => c.id !== cId);
      await onSave(nueva);
    };
    if (onConfirm) {
      onConfirm('Eliminar nota', '¿Seguro que quieres eliminar esta nota?', doDelete);
    } else if (confirm('¿Eliminar esta nota?')) {
      doDelete();
    }
  };

  return (
    <>
      {comentarios.length > 0 && (
        <div className="space-y-5 mb-5">
          {comentarios.map((c) => (
            <div key={c.id} className="flex gap-3 group">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5">
                {avatarInitials(c.usuario)}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap mb-1">
                  <span className="text-sm font-semibold text-gray-900">{c.usuario}</span>
                  <span className="text-xs text-gray-400">{fmtDate(c.created_at)}</span>
                  {c.editado_at && (
                    <span className="text-xs text-gray-300 italic">editado</span>
                  )}
                </div>

                {editing?.id === c.id ? (
                  <div className="space-y-2">
                    <textarea
                      rows={3}
                      value={editing.texto}
                      onChange={(e) => setEditing((p) => ({ ...p, texto: e.target.value }))}
                      className="w-full border border-blue-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveEdit}
                        disabled={savingEdit || !editing.texto.trim()}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg disabled:opacity-50"
                      >
                        <Check size={11} /> {savingEdit ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.texto}</p>
                )}
              </div>

              {editing?.id !== c.id && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5">
                  <button
                    onClick={() => handleStartEdit(c)}
                    className="p-1 text-gray-300 hover:text-blue-500 rounded"
                    title="Editar nota"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="p-1 text-gray-300 hover:text-red-400 rounded"
                    title="Eliminar nota"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {comentarios.length === 0 && (
        <p className="text-sm text-gray-400 mb-4">Sin notas todavía.</p>
      )}

      <div className="flex gap-3 items-start">
        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 shrink-0 mt-0.5">
          {currentUser ? (
            <span className="text-xs font-bold">
              {avatarInitials(currentUser.user_metadata?.full_name || currentUser.email)}
            </span>
          ) : (
            <User2 size={14} />
          )}
        </div>
        <div className="flex-1 relative">
          <textarea
            rows={2}
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Añade una nota... (Cmd+Enter para guardar)"
            className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none pr-12"
          />
          <button
            onClick={handleAdd}
            disabled={!nuevo.trim() || saving}
            className="absolute right-2.5 bottom-2.5 p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Guardar nota"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-1.5 ml-11">Cmd+Enter para guardar</p>
    </>
  );
}

function avatarInitials(name) {
  if (!name) return '?';
  const parts = name.split(/[\s@]/);
  return (parts[0]?.[0] || '').toUpperCase() + (parts[1]?.[0] || '').toUpperCase();
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
  );
}
