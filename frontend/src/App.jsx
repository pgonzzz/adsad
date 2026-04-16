import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthGuard from './components/AuthGuard';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inversores from './pages/Inversores';
import InversorDetalle from './pages/InversorDetalle';
import Proveedores from './pages/Proveedores';
import Propiedades from './pages/Propiedades';
import Matches from './pages/Matches';
import Operaciones from './pages/Operaciones';
import Peticiones from './pages/Peticiones';
import Captacion from './pages/Captacion';
import PropiedadDetalle from './pages/PropiedadDetalle';
import Calculadora from './pages/Calculadora';
import AuditLog from './pages/AuditLog';
import LeadDetalle from './pages/LeadDetalle';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <AuthGuard>
              <Layout />
            </AuthGuard>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="inversores" element={<Inversores />} />
          <Route path="inversores/:id" element={<InversorDetalle />} />
          <Route path="peticiones" element={<Peticiones />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="propiedades" element={<Propiedades />} />
          <Route path="propiedades/:id" element={<PropiedadDetalle />} />
          <Route path="matches" element={<Matches />} />
          <Route path="operaciones" element={<Operaciones />} />
          <Route path="captacion/leads/:leadId" element={<LeadDetalle />} />
          <Route path="captacion/:campanaId" element={<Captacion />} />
          <Route path="captacion" element={<Captacion />} />
          <Route path="calculadora" element={<Calculadora />} />
          <Route path="actividad" element={<AuditLog />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
