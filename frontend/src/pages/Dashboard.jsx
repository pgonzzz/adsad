import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Users, Building2, GitMerge, TrendingUp, Briefcase, Euro } from 'lucide-react';
import { dashboardApi } from '../api';

function StatCard({ label, value, icon: Icon, color, to }) {
  const content = (
    <div className={`bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4 shadow-sm ${to ? 'hover:shadow-md transition-shadow' : ''}`}>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value ?? '—'}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
  return to ? <Link to={to}>{content}</Link> : content;
}

function fmt(n) {
  if (!n) return '0 €';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
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

  if (loading) return <p className="text-gray-400">Cargando...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-gray-500 text-sm mb-8">Resumen general del negocio</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <StatCard label="Inversores" value={stats?.inversores} icon={Users} color="bg-blue-500" to="/inversores" />
        <StatCard label="Peticiones activas" value={stats?.peticionesActivas} icon={TrendingUp} color="bg-purple-500" to="/peticiones" />
        <StatCard label="Propiedades disponibles" value={stats?.propDisponibles} icon={Building2} color="bg-indigo-500" to="/propiedades" />
        <StatCard label="Matches nuevos" value={stats?.matchesNuevos} icon={GitMerge} color="bg-orange-500" to="/matches" />
        <StatCard label="Operaciones en curso" value={stats?.operacionesEnCurso} icon={Briefcase} color="bg-green-500" to="/operaciones" />
        <StatCard label="Comisiones cerradas" value={fmt(stats?.comisionesTotales)} icon={Euro} color="bg-emerald-500" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-1">Volumen total cerrado</h2>
        <p className="text-3xl font-bold text-gray-900">{fmt(stats?.volumenCerrado)}</p>
      </div>
    </div>
  );
}
