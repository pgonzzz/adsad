-- ============================================================
-- Enlazar propiedades con el lead de captación del que salieron
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES captacion_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_propiedades_lead ON propiedades(lead_id);
