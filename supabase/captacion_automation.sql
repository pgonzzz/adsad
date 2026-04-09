-- ============================================================
-- Captación: automatización de scraping y WhatsApp
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--
-- Añade campos a captacion_campanas para que el scheduler del
-- backend pueda crear tareas de scraping, envío inicial y
-- follow-up sin que el usuario tenga que pulsar ningún botón.
--

ALTER TABLE captacion_campanas
  ADD COLUMN IF NOT EXISTS scrape_auto BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS scrape_intervalo_horas INTEGER DEFAULT 24,
  ADD COLUMN IF NOT EXISTS scrape_ultimo_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS wa_auto_enviar BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS followup_auto BOOLEAN DEFAULT FALSE,
  -- URL de Idealista pegada por el usuario (recomendado para evitar guessing
  -- de slugs — los mapeos provincia/población no son fiables con homónimos
  -- como "Salamanca" ciudad vs. barrio Salamanca de Madrid)
  ADD COLUMN IF NOT EXISTS url_inicial TEXT;

-- Índice parcial para búsquedas rápidas del scheduler
CREATE INDEX IF NOT EXISTS idx_campanas_auto_activa
  ON captacion_campanas (estado)
  WHERE estado = 'activa'
    AND (scrape_auto = TRUE OR wa_auto_enviar = TRUE OR followup_auto = TRUE);
