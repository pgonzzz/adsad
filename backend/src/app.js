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
import telegramRouter, { handleBotMessage } from './routes/telegram.js';
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
app.post('/api/telegram/webhook', (req, res) => {
  res.status(200).json({ ok: true });
  const msg = req.body?.message;
  if (msg?.text && msg?.chat?.id && msg?.from?.id) {
    console.log(`[TgBot] Mensaje de ${msg.from?.first_name || msg.chat.id} (userId=${msg.from.id}, chatId=${msg.chat.id}): "${msg.text.slice(0, 60)}"`);
    handleBotMessage(msg.chat.id, msg.from.id, msg.text.trim()).catch(err => {
      console.error('[TgBot] Error:', err.message);
    });
  }
});
app.get('/api/telegram/setup-webhook', async (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const backendUrl = process.env.BACKEND_URL || 'https://crm-pisalia-production.up.railway.app';
  const webhookUrl = `${backendUrl}/api/telegram/webhook`;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: webhookUrl }),
    });
    const data = await r.json();
    res.json({ ok: true, webhook_url: webhookUrl, telegram: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
