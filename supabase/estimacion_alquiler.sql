-- ============================================================
-- Añadir campo estimacion_alquiler a propiedades
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS estimacion_alquiler NUMERIC;
