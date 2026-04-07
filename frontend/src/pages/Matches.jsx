import { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { matchesApi, operacionesApi } from '../api';
import Badge from '../components/Badge';
import Modal from '../components/Modal';

function ScoreBar({ score }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-gray-300';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-gray-500">{score}</span>
    </div>
  );
}

function fmt(n) {
  if (!n) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}

const ACCIONES = {
  sugerido: [{ label: 'Marcar enviado', next: 'enviado' }, { label: 'Descartar', next: 'descartado' }],
  enviado: [{ label: 'En negociación', next: 'negociando' }, { label: 'Descartar', next: 'descartado' }],
  negociando: [{ label: 'Crear operación', next: 'operacion' }, { label: 'Descartar', next: 'descartado' }],
  cerrado: [],
  descartado: [],
};

const emptyOp = { precio_final: '', comision: '', fecha_firma: '', notas: '' };

export default function Matches() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [opModal, setOpModal] = useState(false);
  const [opMatchId, setOpMatchId] = useState(null);
  const [opForm, setOpForm] = useState(emptyOp);

  const load = () => {
    setLoading(true);
    const params = filtroEstado ? { estado: filtroEstado } : {};
    matchesApi.getAll(params)
      .then(setMatches)
      .finally(() => setLoading(false));
  };

  useEffect(load, [filtroEstado]);

  const generar = async () => {
    setGenerando(true);
    setResultado(null);
    try {
      const res = await matchesApi.generar();
      setResultado(res);
      load();
    } finally {
      setGenerando(false);
    }
  };

  const cambiarEstado = async (id, next) => {
    if (next === 'operacion') {
      setOpMatchId(id);
      setOpForm(emptyOp);
      setOpModal(true);
      return;
    }
    await matchesApi.update(id, { estado: next });
    load();
  };

  const handleCrearOp = async (e) => {
    e.preventDefault();
    await operacionesApi.create({
      match_id: opMatchId,
      estado: 'en_curso',
      precio_final: opForm.precio_final ? Number(opForm.precio_final) : null,
      comision: opForm.comision ? Number(opForm.comision) : null,
      fecha_firma: opForm.fecha_firma || null,
      notas: opForm.notas,
    });
    await matchesApi.update(opMatchId, { estado: 'cerrado' });
    setOpModal(false);
    load();
  };

  const setOp = (k) => (e) => setOpForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Matches</h1>
        <button
          onClick={generar}
          disabled={generando}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-60"
        >
          <Zap size={15} />
          {generando ? 'Generando...' : 'Generar matches'}
        </button>
      </div>

      {resultado && (
        <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-800">
          {resultado.creados > 0
            ? `✓ Se crearon ${resultado.creados} matches nuevos (de ${resultado.total} candidatos detectados)`
            : resultado.mensaje || 'No se encontraron matches nuevos'}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b">
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Todos los estados</option>
            <option value="sugerido">Sugerido</option>
            <option value="enviado">Enviado</option>
            <option value="negociando">Negociando</option>
            <option value="cerrado">Cerrado</option>
            <option value="descartado">Descartado</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Inversor</th>
                <th className="px-4 py-3">Busca</th>
                <th className="px-4 py-3">Propiedad</th>
                <th className="px-4 py-3">Precio</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">Cargando...</td></tr>
              ) : matches.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">
                  No hay matches. Añade inversores con peticiones y propiedades disponibles, luego pulsa "Generar matches".
                </td></tr>
              ) : matches.map(m => {
                const inv = m.peticiones?.inversores;
                const pet = m.peticiones;
                const prop = m.propiedades;
                return (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3"><ScoreBar score={m.score} /></td>
                    <td className="px-4 py-3 font-medium text-gray-900">{inv?.nombre || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <div>{pet?.tipos_propiedad?.join(', ') || '—'}</div>
                      {pet?.zona && <div className="text-xs text-gray-400">{pet.zona}</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      <div className="font-medium">{prop?.tipo} · {prop?.zona || '—'}</div>
                      {prop?.rentabilidad_bruta && <div className="text-xs text-gray-400">{prop.rentabilidad_bruta}% bruta</div>}
                    </td>
                    <td className="px-4 py-3 text-gray-900">{fmt(prop?.precio)}</td>
                    <td className="px-4 py-3"><Badge value={m.estado} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(ACCIONES[m.estado] || []).map(acc => (
                          <button key={acc.next}
                            onClick={() => cambiarEstado(m.id, acc.next)}
                            className={`px-2 py-1 text-xs rounded font-medium ${
                              acc.next === 'descartado' ? 'bg-red-50 text-red-600 hover:bg-red-100'
                              : acc.next === 'operacion' ? 'bg-green-50 text-green-700 hover:bg-green-100'
                              : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                            }`}>
                            {acc.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={opModal} onClose={() => setOpModal(false)} title="Crear operación">
        <form onSubmit={handleCrearOp} className="space-y-4">
          <p className="text-sm text-gray-500">Se creará una operación a partir de este match y se marcará como cerrado.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Precio final (€)</label>
              <input type="number" value={opForm.precio_final} onChange={setOp('precio_final')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Comisión (€)</label>
              <input type="number" value={opForm.comision} onChange={setOp('comision')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha firma prevista</label>
            <input type="date" value={opForm.fecha_firma} onChange={setOp('fecha_firma')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea rows={2} value={opForm.notas} onChange={setOp('notas')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setOpModal(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit"
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Crear operación</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
