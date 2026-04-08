import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import NotificacionesBell from './NotificacionesBell';

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-12 bg-gray-900 border-b border-gray-700 flex items-center justify-end px-5 shrink-0">
          <NotificacionesBell />
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
