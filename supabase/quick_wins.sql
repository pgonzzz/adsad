-- ============================================================
-- Quick wins: campos de propiedades + tags + notas/timeline
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--
-- Añade los siguientes campos/tablas de un solo paso:
--
--  1. propiedades: m2, habitaciones, banos, planta, anio_construccion,
--     ref_catastral, direccion (para mapa), tags.
--  2. inversores: tags, comentarios (timeline de notas).
--  3. captacion_leads: tags (para marcar #caliente / #descartar).
--
-- Todas las ALTER TABLE usan IF NOT EXISTS para ser idempotentes.
--

-- ─── 1. Propiedades: nuevas características ───────────────────────
ALTER TABLE propiedades
  ADD COLUMN IF NOT EXISTS m2 NUMERIC,
  ADD COLUMN IF NOT EXISTS habitaciones INTEGER,
  ADD COLUMN IF NOT EXISTS banos INTEGER,
  ADD COLUMN IF NOT EXISTS planta TEXT,
  ADD COLUMN IF NOT EXISTS anio_construccion INTEGER,
  ADD COLUMN IF NOT EXISTS ref_catastral TEXT,
  ADD COLUMN IF NOT EXISTS direccion TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ─── 2. Inversores: tags + timeline de notas ─────────────────────
ALTER TABLE inversores
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS comentarios JSONB DEFAULT '[]'::JSONB;

-- ─── 3. Captación leads: tags ────────────────────────────────────
ALTER TABLE captacion_leads
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT ARRAY[]::TEXT[];

-- ─── 4. Índices útiles para búsqueda/filtrado por tag ────────────
-- GIN soporta operadores de arrays (@>, &&, etc) y acelera búsquedas
-- tipo "propiedades con tag 'reformada'".
CREATE INDEX IF NOT EXISTS idx_propiedades_tags
  ON propiedades USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_inversores_tags
  ON inversores USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_captacion_leads_tags
  ON captacion_leads USING GIN (tags);
