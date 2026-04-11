import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Building2, MessageSquare, UserCheck, Home, TrendingUp } from 'lucide-react';
import { dashboardApi } from '../api';

const PIPELINE = [
  { value: 'en_busca',     label: 'En busca',          color: 'bg-blue-500' },
  { value: 'reservada',    label: 'Reservada',          color: 'bg-purple-500' },
  { value: 'financiacion', label: 'Financiación',       color: 'bg-amber-500' },
  { value: 'tramites',     label: 'Trámites',           color: 'bg-orange-500' },
  { value: 'comprado',     label: 'Comprado',           color: 'bg-green-500' },
  { value: 'pospuesto',    label: 'Pospuesto',          color: 'bg-gray-400' },
  { value: 'descartado',   label: 'Descartado',         color: 'bg-red-400' },
];

const PROP_ESTADOS = [
  { value: 'disponible',    label: 'Disponible',    color: 'bg-green-500' },
  { value: 'reservada',     label: 'Reservada',     color: 'bg-purple-500' },
  { value: 'en_negociacion',label: 'Negociación',   color: 'bg-amber-500' },
  { value: 'vendida',       label: 'Vendida',        color: 'bg-gray-400' },
];

function StatCard({ label, value, icon: Icon, color, to, sub }) {
  const content = (
    <div className={`bg-white rounded-xl border border-gray-200 p-3 sm:p-5 flex items-center gap-3 sm:gap-4 shadow-sm ${to ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}>
      <div className={`p-2.5 sm:p-3 rounded-lg ${color} shrink-0`}>
        <Icon size={18} className="text-white sm:hidden" />
        <Icon size={20} className="text-white hidden sm:block" />
      </div>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-xs sm:text-sm text-gray-500 leading-tight">{label}</p>
        {sub && <p className="text-[10px] sm:text-xs text-gray-400 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function BarChart({ title, data, total, to }) {
  if (!total) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
        {to && <Link to={to} className="text-xs text-blue-600 hover:underline">Ver todos</Link>}
      </div>
      <div className="space-y-2.5">
        {data.map(({ label, value, color }) => {
          if (!value) return null;
          const pct = Math.round((value / total) * 100);
          return (
            <div key={label}>
              <div className="flex items-center justify-between text-xs text-gray-600 mb-0.5">
                <span>{label}</span>
                <span className="font-medium">{value}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div
                  className={`${color} h-2 rounded-full transition-all duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CaptacionCard({ data }) {
  const tasa = data.total > 0 ? Math.round((data.respondidos / data.total) * 100) : 0;
  const conv = data.respondidos > 0 ? Math.round((data.convertidos / data.respondidos) * 100) : 0;
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Captación</h2>
        <Link to="/captacion" className="text-xs text-blue-600 hover:underline">Ver campaña</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-900">{data.mensajesHoy}</p>
          <p className="text-xs text-gray-500 mt-0.5">Mensajes hoy</p>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-2xl font-bold text-gray-900">{data.total}</p>
          <p className="text-xs text-gray-500 mt-0.5">Leads totales</p>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <p className="text-2xl font-bold text-green-700">{data.respondidos}</p>
          <p className="text-xs text-gray-500 mt-0.5">Han respondido</p>
          {tasa > 0 && <p className="text-xs font-medium text-green-600">{tasa}% resp.</p>}
        </div>
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <p className="text-2xl font-bold text-blue-700">{data.convertidos}</p>
          <p className="text-xs text-gray-500 mt-0.5">Convertidos</p>
          {conv > 0 && <p className="text-xs font-medium text-blue-600">{conv}% conv.</p>}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardApi.getStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">Cargando...</div>
  );

  const totalProp = stats ? Object.values(stats.propPorEstado || {}).reduce((a, b) => a + b, 0) : 0;
  const totalInv = stats?.totalInversores || 0;

  const propData = PROP_ESTADOS.map(e => ({
    label: e.label,
    value: stats?.propPorEstado?.[e.value] || 0,
    color: e.color,
  }));

  const pipelineData = PIPELINE.map(p => ({
    label: p.label,
    value: stats?.invPorPipeline?.[p.value] || 0,
    color: p.color,
  }));

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-gray-500 text-xs sm:text-sm mb-4 sm:mb-6">Resumen general del negocio</p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <StatCard
          label="Inversores activos"
          value={stats?.inversoresActivos}
          sub={`${totalInv} totales`}
          icon={Users}
          color="bg-blue-500"
          to="/inversores"
        />
        <StatCard
          label="Propiedades disponibles"
          value={stats?.propDisponibles}
          sub={`${totalProp} en cartera`}
          icon={Building2}
          color="bg-indigo-500"
          to="/propiedades"
        />
        <StatCard
          label="Mensajes enviados hoy"
          value={stats?.captacion?.mensajesHoy ?? 0}
          sub="vía WhatsApp"
          icon={MessageSquare}
          color="bg-green-500"
          to="/captacion"
        />
        <StatCard
          label="Leads convertidos"
          value={stats?.captacion?.convertidos ?? 0}
          sub={`de ${stats?.captacion?.total ?? 0} captados`}
          icon={UserCheck}
          color="bg-purple-500"
          to="/captacion"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <BarChart
          title="Inversores por etapa"
          data={pipelineData}
          total={totalInv}
          to="/inversores"
        />
        <BarChart
          title="Propiedades por estado"
          data={propData}
          total={totalProp || 1}
          to="/propiedades"
        />
        <CaptacionCard data={stats?.captacion || { mensajesHoy: 0, total: 0, respondidos: 0, convertidos: 0 }} />
      </div>
    </div>
  );
}
