import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { authMiddleware } from './middleware/auth.js';
import inversoresRouter from './routes/inversores.js';
import peticionesRouter from './routes/peticiones.js';
import proveedoresRouter from './routes/proveedores.js';
import propiedadesRouter from './routes/propiedades.js';
import matchesRouter from './routes/matches.js';
import operacionesRouter from './routes/operaciones.js';
import dashboardRouter from './routes/dashboard.js';
import captacionRouter from './routes/captacion.js';
import activityLogRouter from './routes/activity-log.js';
import telegramRouter from './routes/telegram.js';
import generatePropertyRouter from './routes/generate-property.js';
import recordatoriosRouter from './routes/recordatorios.js';
import notificacionesRouter from './routes/notificaciones.js';
import { startScheduler } from './scheduler.js';

dotenv.config();

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'https://crm.pisalia.es',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('CORS no permitido'));
  },
  credentials: true,
}));

app.use(express.json({ limit: '15mb' }));

// Health check (sin auth)
app.get('/health', (_req, res) => res.json({ ok: true }));

// Telegram: webhook y setup sin auth (Telegram no envía Bearer token)
// Las demás rutas de telegram (posts, config, etc.) van con auth más abajo.
app.use('/api/telegram/webhook', telegramRouter);
app.use('/api/telegram/setup-webhook', telegramRouter);

// Rutas protegidas
app.use('/api/inversores', authMiddleware, inversoresRouter);
app.use('/api/peticiones', authMiddleware, peticionesRouter);
app.use('/api/proveedores', authMiddleware, proveedoresRouter);
app.use('/api/propiedades', authMiddleware, propiedadesRouter);
app.use('/api/matches', authMiddleware, matchesRouter);
app.use('/api/operaciones', authMiddleware, operacionesRouter);
app.use('/api/dashboard', authMiddleware, dashboardRouter);
app.use('/api/activity-log', authMiddleware, activityLogRouter);
app.use('/api/telegram', authMiddleware, telegramRouter);
app.use('/api/propiedades/generate', authMiddleware, generatePropertyRouter);
app.use('/api/recordatorios', authMiddleware, recordatoriosRouter);
app.use('/api/notificaciones', authMiddleware, notificacionesRouter);
// Captación: las rutas del agente no llevan authMiddleware (usan AGENT_KEY propia)
app.use('/api/captacion', captacionRouter);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`CRM Pisalia API corriendo en puerto ${PORT}`);
  // Scheduler de captación — crea tareas automáticas para campañas activas
  if (process.env.SCHEDULER_ENABLED !== 'false') {
    startScheduler();
  } else {
    console.log('[Scheduler] Deshabilitado por SCHEDULER_ENABLED=false');
  }
});
