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
} from 'lucide-react';
import { supabase } from '../lib/supabase';

const nav = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/inversores', label: 'Inversores', icon: Users },
  { to: '/peticiones', label: 'Peticiones', icon: ClipboardList },
  { to: '/propiedades', label: 'Propiedades', icon: Building2 },
  { to: '/proveedores', label: 'Proveedores', icon: Briefcase },
  { to: '/matches', label: 'Matches', icon: GitMerge },
  { to: '/operaciones', label: 'Operaciones', icon: TrendingUp },
];

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <aside className="w-56 bg-gray-900 text-gray-100 flex flex-col shrink-0">
      <div className="px-5 py-6 border-b border-gray-700">
        <span className="text-lg font-bold tracking-tight">Pisalia CRM</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
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
  );
}
