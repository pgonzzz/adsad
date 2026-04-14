-- ============================================================
-- WhatsApp: tracking de ACKs (enviado/entregado/leido)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Nuevas columnas en captacion_envios para trackear estado WA
ALTER TABLE captacion_envios
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS ack_status TEXT DEFAULT 'enviado',
  ADD COLUMN IF NOT EXISTS ack_at TIMESTAMPTZ;

-- Índice para buscar rápido por message_id cuando llega un ACK
CREATE INDEX IF NOT EXISTS idx_envios_message_id
  ON captacion_envios (message_id)
  WHERE message_id IS NOT NULL;

-- Campo en leads para mostrar el ACK más reciente en la tabla
ALTER TABLE captacion_leads
  ADD COLUMN IF NOT EXISTS ultimo_ack TEXT;
