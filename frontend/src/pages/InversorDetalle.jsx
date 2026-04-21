import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil, Check } from 'lucide-react';
import { inversoresApi, peticionesApi, propiedadesApi } from '../api';
import Modal from '../components/Modal';
import Badge from '../components/Badge';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import LoadingSpinner from '../components/LoadingSpinner';
import Combobox, { ComboboxMunicipios } from '../components/Combobox';
import TagsInput, { TagsDisplay } from '../components/TagsInput';
import NotesTimeline from '../components/NotesTimeline';
import ContratosSection from '../components/ContratosSection';
import { PROVINCIAS } from '../data/municipios';

const TIPOS = ['piso', 'local', 'nave', 'edificio', 'solar', 'otro'];

const PIPELINE = [
  { value: 'en_busca',     label: 'En busca de propiedad',    bg: 'bg-blue-100',   text: 'text-blue-700' },
  { value: 'reservada',    label: 'Propiedad reservada',       bg: 'bg-purple-100', text: 'text-purple-700' },
  { value: 'financiacion', label: 'Pendiente de financiación', bg: 'bg-amber-100',  text: 'text-amber-700' },
  { value: 'tramites',     label: 'En trámites',               bg: 'bg-orange-100', text: 'text-orange-700' },
  { value: 'comprado',     label: 'Comprado',                  bg: 'bg-green-100',  text: 'text-green-700' },
  { value: 'pospuesto',    label: 'Pospuesto',                 bg: 'bg-gray-100',   text: 'text-gray-500' },
  { value: 'descartado',   label: 'Descartado',                bg: 'bg-red-100',    text: 'text-red-700' },
];

function PipelineTag({ value }) {
  const stage = PIPELINE.find(p => p.value === value) || PIPELINE[0];
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${stage.bg} ${stage.text}`}>
      {stage.label}
    </span>
  );
}

const emptyPeticion = {
  tipos_propiedad: [], provincia: '', poblacion: '', precio_min: '', precio_max: '',
  rentabilidad_min: '', necesita_financiacion: false, estado: 'activa', notas: '',
};

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

export default function InversorDetalle() {
  const { id } = useParams();
  const toast = useToast();
  const [inversor, setInversor] = useState(null);
  const [propiedades, setPropiedades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPeticion);
  const [savingPropiedad, setSavingPropiedad] = useState(false);
  const [selectedPropiedad, setSelectedPropiedad] = useState('');
  const [confirmDlg, setConfirmDlg] = useState(null);

  // Edición in-line de etiquetas
  const [editingTags, setEditingTags] = useState(false);
  const [draftTags, setDraftTags] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      inversoresApi.getById(id),
      propiedadesApi.getAll(),
    ]).then(([inv, props]) => {
      setInversor(inv);
      setPropiedades(props);
      setSelectedPropiedad(inv.propiedad_id || '');
    }).finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const openCreate = () => { setEditing(null); setForm(emptyPeticion); setModal(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({
      tipos_propiedad: p.tipos_propiedad || [],
      provincia: p.provincia || '',
      poblacion: p.poblacion || '',
      precio_min: p.precio_min || '',
      precio_max: p.precio_max || '',
      rentabilidad_min: p.rentabilidad_min || '',
      necesita_financiacion: p.necesita_financiacion || false,
      estado: p.estado || 'activa',
      notas: p.notas || '',
    });
    setModal(true);
  };

  const toggleTipo = (tipo) => {
    setForm(f => ({
      ...f,
      tipos_propiedad: f.tipos_propiedad.includes(tipo)
        ? f.tipos_propiedad.filter(t => t !== tipo)
        : [...f.tipos_propiedad, tipo],
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      inversor_id: id,
      precio_min: form.precio_min ? Number(form.precio_min) : null,
      precio_max: form.precio_max ? Number(form.precio_max) : null,
      rentabilidad_min: form.rentabilidad_min ? Number(form.rentabilidad_min) : null,
    };
    if (editing) await peticionesApi.update(editing.id, payload);
    else await peticionesApi.create(payload);
    setModal(false);
    load();
    toast.success(editing ? 'Petición actualizada' : 'Petición creada');
  };

  const handleDelete = (petId) => {
    setConfirmDlg({
      title: 'Eliminar petición',
      message: '¿Seguro que quieres eliminar esta petición?',
      onConfirm: async () => {
        await peticionesApi.delete(petId);
        setConfirmDlg(null);
        load();
        toast.success('Petición eliminada');
      },
    });
  };

  const handleAsociarPropiedad = async () => {
    setSavingPropiedad(true);
    await inversoresApi.update(id, { propiedad_id: selectedPropiedad || null });
    await load();
    setSavingPropiedad(false);
  };

  const startEditTags = () => {
    setDraftTags(inversor?.tags || []);
    setEditingTags(true);
  };
  const saveTags = async () => {
    await inversoresApi.update(id, { tags: draftTags });
    setEditingTags(false);
    load();
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  if (loading) return <LoadingSpinner />;
  if (!inversor) return <p className="text-red-500">Inversor no encontrado</p>;

  const propiedadAsociada = inversor.propiedad;

  return (
    <div>
      <Link to="/inversores" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft size={14} /> Inversores
      </Link>

      {/* Cabecera */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {[inversor.nombre, inversor.apellidos].filter(Boolean).join(' ')}
              </h1>
              <PipelineTag value={inversor.pipeline} />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
              {inversor.email && <span>{inversor.email}</span>}
              {inversor.telefono && <span>{inversor.telefono}</span>}
              {inversor.empresa && <span className="font-medium">{inversor.empresa}</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              {inversor.necesita_financiacion && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">Necesita financiación</span>
              )}
            </div>
            {inversor.notas && <p className="mt-3 text-sm text-gray-500 max-w-xl">{inversor.notas}</p>}

            {/* Etiquetas */}
            <div className="mt-4 pt-4 border-t border-gray-100">
              {editingTags ? (
                <div className="space-y-2 max-w-lg">
                  <TagsInput
                    value={draftTags}
                    onChange={setDraftTags}
                    placeholder="Ej: vip, solo-efectivo, premium…"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveTags}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg"
                    >
                      <Check size={11} /> Guardar
                    </button>
                    <button
                      onClick={() => setEditingTags(false)}
                      className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  {inversor.tags?.length > 0 ? (
                    <TagsDisplay tags={inversor.tags} size="md" />
                  ) : (
                    <span className="text-xs text-gray-400">Sin etiquetas</span>
                  )}
                  <button
                    onClick={startEditTags}
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                  >
                    <Pencil size={10} /> {inversor.tags?.length > 0 ? 'Editar' : 'Añadir'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Propiedad asociada */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Propiedad asociada</h2>

        {propiedadAsociada ? (
          <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
            <div>
              <div className="font-medium text-gray-900">
                {propiedadAsociada.tipo?.charAt(0).toUpperCase() + propiedadAsociada.tipo?.slice(1)} — {propiedadAsociada.zona}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {fmt(propiedadAsociada.precio)}
                {propiedadAsociada.rentabilidad_bruta && <span className="ml-3">Rent. bruta: {propiedadAsociada.rentabilidad_bruta}%</span>}
              </div>
              {propiedadAsociada.descripcion && (
                <div className="text-xs text-gray-500 mt-1">{propiedadAsociada.descripcion}</div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-4">Sin propiedad asociada</p>
        )}

        <div className="flex items-center gap-3">
          <select
            value={selectedPropiedad}
            onChange={e => setSelectedPropiedad(e.target.value)}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Sin propiedad asociada —</option>
            {propiedades.map(p => (
              <option key={p.id} value={p.id}>
                {p.tipo?.charAt(0).toUpperCase() + p.tipo?.slice(1)} — {p.zona} — {fmt(p.precio)}
              </option>
            ))}
          </select>
          <button
            onClick={handleAsociarPropiedad}
            disabled={savingPropiedad}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {savingPropiedad ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Notas / Timeline */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Notas</h2>
        <NotesTimeline
          comentarios={inversor.comentarios || []}
          onSave={async (nueva) => {
            await inversoresApi.update(id, { comentarios: nueva });
            setInversor((inv) => ({ ...inv, comentarios: nueva }));
          }}
        />
      </div>

      {/* Peticiones */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Peticiones de búsqueda</h2>
          <button onClick={openCreate} className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700">
            + Nueva petición
          </button>
        </div>

        {inversor.peticiones?.length === 0 ? (
          <p className="text-center py-10 text-gray-400 text-sm">Sin peticiones todavía</p>
        ) : (
          <div className="divide-y">
            {inversor.peticiones?.map(p => (
              <div key={p.id} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge value={p.estado} />
                      {p.tipos_propiedad?.map(t => (
                        <span key={t} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{t}</span>
                      ))}
                      {p.necesita_financiacion && (
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Con financiación</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      {(p.provincia || p.poblacion) && (
                        <span><span className="text-gray-400">Ubicación:</span> {[p.poblacion, p.provincia].filter(Boolean).join(', ')}</span>
                      )}
                      {(p.precio_min || p.precio_max) && (
                        <span><span className="text-gray-400">Precio:</span> {fmt(p.precio_min)} – {fmt(p.precio_max)}</span>
                      )}
                      {p.rentabilidad_min && (
                        <span><span className="text-gray-400">Rent. min:</span> {p.rentabilidad_min}%</span>
                      )}
                    </div>
                    {p.notas && <p className="text-xs text-gray-400">{p.notas}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0 text-sm">
                    <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-gray-700">Editar</button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600">Eliminar</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contratos asociados — invisible si el usuario no está en la allowlist */}
      <div className="mt-6">
        <ContratosSection inversorId={id} />
      </div>

      {/* Modal petición */}
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar petición' : 'Nueva petición'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Tipos de propiedad</label>
            <div className="flex flex-wrap gap-2">
              {TIPOS.map(t => (
                <label key={t} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-sm transition-colors ${
                  form.tipos_propiedad.includes(t) ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}>
                  <input type="checkbox" className="hidden" checked={form.tipos_propiedad.includes(t)} onChange={() => toggleTipo(t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
              <Combobox
                options={PROVINCIAS}
                value={form.provincia}
                onChange={v => setForm(f => ({ ...f, provincia: v, poblacion: '' }))}
                placeholder="Buscar provincia..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Población</label>
              <ComboboxMunicipios
                provincia={form.provincia}
                value={form.poblacion}
                onChange={v => setForm(f => ({ ...f, poblacion: v }))}
                placeholder="Escribe para buscar..."
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio mínimo (€)</label>
              <input type="number" value={form.precio_min} onChange={set('precio_min')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio máximo (€)</label>
              <input type="number" value={form.precio_max} onChange={set('precio_max')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rentabilidad mínima (%)</label>
              <input type="number" step="0.1" value={form.rentabilidad_min} onChange={set('rentabilidad_min')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select value={form.estado} onChange={set('estado')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="activa">Activa</option>
                <option value="pausada">Pausada</option>
                <option value="cerrada">Cerrada</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.necesita_financiacion}
              onChange={e => setForm(f => ({ ...f, necesita_financiacion: e.target.checked }))} />
            <span className="text-sm text-gray-700">Necesita financiación</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea rows={2} value={form.notas} onChange={set('notas')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {editing ? 'Guardar cambios' : 'Crear petición'}
            </button>
          </div>
        </form>
      </Modal>

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
