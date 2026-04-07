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
  create: (data) => post('/propiedades', data),
  update: (id, data) => put(`/propiedades/${id}`, data),
  delete: (id) => del(`/propiedades/${id}`),
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
