import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Building2,
  Briefcase,
  GitMerge,
  TrendingUp,
  ClipboardList,
  LogOut,
  Search,
  X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inversores', label: 'Inversores', icon: Users },
  { to: '/peticiones', label: 'Peticiones', icon: ClipboardList },
  { to: '/propiedades', label: 'Propiedades', icon: Building2 },
  { to: '/captacion', label: 'Captación', icon: Search },
  { to: '/proveedores', label: 'Proveedores', icon: Briefcase },
  { to: '/matches', label: 'Matches', icon: GitMerge },
  { to: '/operaciones', label: 'Operaciones', icon: TrendingUp },
];

export default function Sidebar({ open = false, onClose = () => {} }) {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <>
      {/* Overlay oscuro en móvil cuando la sidebar está abierta */}
      {open && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-30"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar propiamente dicha */}
      <aside
        className={`
          fixed md:static top-0 left-0 h-full z-40
          w-60 bg-gray-900 text-gray-100 flex flex-col shrink-0
          transform transition-transform duration-200 ease-out
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
        `}
      >
        <div className="px-5 py-5 border-b border-gray-700 flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">Pisalia CRM</span>
          {/* Botón cerrar solo visible en móvil */}
          <button
            onClick={onClose}
            className="md:hidden p-1 text-gray-400 hover:text-white"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-4">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
        <div className="px-5 py-3 border-t border-gray-700 text-xs text-gray-500">
          v1.0 · Pisalia
        </div>
      </aside>
    </>
  );
}
