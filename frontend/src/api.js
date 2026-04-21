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

// Helper: convierte un File del navegador a base64 (sin el prefijo data:...)
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = String(result).split('base64,')[1] || String(result);
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export const contratosApi = {
  // Comprueba si el usuario actual tiene acceso al módulo. 200 → true, 403 → false.
  checkAccess: () => api.get('/contratos/access').then(() => true).catch(() => false),

  // Plantillas
  getPlantillas: () => get('/contratos/plantillas'),
  getPlantilla: (id) => get(`/contratos/plantillas/${id}`),
  createPlantilla: async ({ nombre, descripcion, file }) => {
    const archivo_base64 = await fileToBase64(file);
    return post('/contratos/plantillas', {
      nombre,
      descripcion,
      archivo_base64,
      archivo_nombre: file.name,
    });
  },
  deletePlantilla: (id) => del(`/contratos/plantillas/${id}`),
  downloadPlantilla: async (id, nombre) => {
    const response = await api.get(`/contratos/plantillas/${id}/download`, { responseType: 'blob' });
    triggerBlobDownload(response.data, `${nombre}.docx`);
  },
  generateFromPlantilla: async (id, valores, nombreArchivo) => {
    const response = await api.post(
      `/contratos/plantillas/${id}/generate`,
      { valores },
      { responseType: 'blob' }
    );
    triggerBlobDownload(response.data, `${nombreArchivo}.docx`);
  },

  // Contratos firmados
  getFirmados: (params) => get('/contratos/firmados', params),
  createFirmado: async ({ nombre, descripcion, file, plantilla_id, valores, inversor_id, proveedor_id }) => {
    const archivo_base64 = await fileToBase64(file);
    return post('/contratos/firmados', {
      nombre,
      descripcion,
      archivo_base64,
      archivo_nombre: file.name,
      archivo_mime: file.type,
      plantilla_id,
      valores,
      inversor_id,
      proveedor_id,
    });
  },
  deleteFirmado: (id) => del(`/contratos/firmados/${id}`),
  downloadFirmado: async (id, nombreArchivo) => {
    const response = await api.get(`/contratos/firmados/${id}/download`, { responseType: 'blob' });
    triggerBlobDownload(response.data, nombreArchivo);
  },
};

function triggerBlobDownload(blobData, filename) {
  const blob = blobData instanceof Blob ? blobData : new Blob([blobData]);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

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
