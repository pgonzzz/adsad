import axios from 'axios';
import { supabase } from './lib/supabase';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Añadir token de auth en cada petición
api.interceptors.request.use(async (config) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

const get = (url, params) => api.get(url, { params }).then(r => r.data);
const post = (url, data) => api.post(url, data).then(r => r.data);
const put = (url, data) => api.put(url, data).then(r => r.data);
const del = (url) => api.delete(url);

export const inversoresApi = {
  getAll: () => get('/inversores'),
  getById: (id) => get(`/inversores/${id}`),
  create: (data) => post('/inversores', data),
  update: (id, data) => put(`/inversores/${id}`, data),
  delete: (id) => del(`/inversores/${id}`),
};

export const peticionesApi = {
  getAll: (params) => get('/peticiones', params),
  create: (data) => post('/peticiones', data),
  update: (id, data) => put(`/peticiones/${id}`, data),
  delete: (id) => del(`/peticiones/${id}`),
};

export const proveedoresApi = {
  getAll: (params) => get('/proveedores', params),
  create: (data) => post('/proveedores', data),
  update: (id, data) => put(`/proveedores/${id}`, data),
  delete: (id) => del(`/proveedores/${id}`),
};

export const propiedadesApi = {
  getAll: (params) => get('/propiedades', params),
  getById: (id) => get(`/propiedades/${id}`),
  create: (data) => post('/propiedades', data),
  update: (id, data) => put(`/propiedades/${id}`, data),
  delete: (id) => del(`/propiedades/${id}`),
  generate: (data) => api.post('/propiedades/generate', data, { timeout: 120000 }).then(r => r.data),
};

export const matchesApi = {
  getAll: (params) => get('/matches', params),
  update: (id, data) => put(`/matches/${id}`, data),
  generar: () => post('/matches/generar'),
  delete: (id) => del(`/matches/${id}`),
};

export const operacionesApi = {
  getAll: (params) => get('/operaciones', params),
  create: (data) => post('/operaciones', data),
  update: (id, data) => put(`/operaciones/${id}`, data),
  delete: (id) => del(`/operaciones/${id}`),
};

export const dashboardApi = {
  getStats: () => get('/dashboard/stats'),
};

export const recordatoriosApi = {
  getAll: (params) => get('/recordatorios', params),
  create: (data) => post('/recordatorios', data),
  update: (id, data) => put(`/recordatorios/${id}`, data),
  delete: (id) => del(`/recordatorios/${id}`),
};

export const notificacionesApi = {
  getAll: (params) => get('/notificaciones', params),
  getNoLeidas: () => get('/notificaciones/no-leidas'),
  marcarLeida: (id) => put(`/notificaciones/${id}/leer`, {}),
  marcarTodasLeidas: () => put('/notificaciones/leer-todas', {}),
};

export const activityLogApi = {
  getAll: (params) => get('/activity-log', params),
};

export const telegramApi = {
  getConfig: () => get('/telegram/config'),
  getPosts: (params) => get('/telegram/posts', params),
  createPost: (data) => post('/telegram/posts', data),
  publishPost: (id) => post(`/telegram/posts/${id}/publish`, {}),
  updatePost: (id, data) => put(`/telegram/posts/${id}`, data),
  deletePost: (id) => del(`/telegram/posts/${id}`),
  getPublished: (propiedadId) => get(`/telegram/propiedad/${propiedadId}/published`),
  getPublishedIds: () => get('/telegram/published-ids'),
  generateText: (propiedad) => post('/telegram/generate-text', { propiedad }),
};

export const captacionApi = {
  getCampanas: () => get('/captacion/campanas'),
  createCampana: (data) => post('/captacion/campanas', data),
  getCampana: (id) => get(`/captacion/campanas/${id}`),
  updateCampana: (id, data) => put(`/captacion/campanas/${id}`, data),
  deleteCampana: (id) => del(`/captacion/campanas/${id}`),
  getLeads: (params) => get('/captacion/leads', params),
  getLeadById: (id) => get(`/captacion/leads/${id}`),
  updateLead: (id, data) => put(`/captacion/leads/${id}`, data),
  deleteLead: (id) => del(`/captacion/leads/${id}`),
  getAgentStatus: () => get('/captacion/agent/status'),
  getMyAgentKey: () => get('/captacion/agent/my-key'),
  // Marca un flag en el backend para que el agente desvincule WhatsApp en
  // el siguiente heartbeat. Tras ~10-20s el CRM verá whatsapp_connected=false
  // y el QR nuevo volverá a aparecer en el banner.
  disconnectWhatsApp: () => post('/captacion/agent/disconnect', {}),
  // Descarga el instalador personalizado para el SO indicado ('windows'/'mac').
  // Usa axios con auth para que el backend sepa qué clave embeder, recibe
  // el fichero como blob y dispara la descarga en el navegador.
  downloadInstaller: async (os) => {
    const response = await api.get(`/captacion/agent/installer?os=${os}`, {
      responseType: 'blob',
    });
    const blob = new Blob([response.data], { type: 'application/octet-stream' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = os === 'windows' ? 'pisalia-agent-setup.bat' : 'pisalia-agent-setup.command';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
  createTarea: (tarea) => post('/captacion/tareas', tarea),
  cancelTarea: (id) => post(`/captacion/tareas/${id}/cancel`, {}),
  getCampanaActiveTask: (campanaId) => get(`/captacion/campanas/${campanaId}/active-task`),
  getLeadEnvios: (leadId) => get(`/captacion/leads/${leadId}/envios`),
  // Plantillas de mensajes
  getPlantillas: (tipo) => get('/captacion/plantillas', tipo ? { tipo } : undefined),
  createPlantilla: (data) => post('/captacion/plantillas', data),
  updatePlantilla: (id, data) => put(`/captacion/plantillas/${id}`, data),
  deletePlantilla: (id) => del(`/captacion/plantillas/${id}`),
};
