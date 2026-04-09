-- ============================================================
-- Captación: añadir columna caracteristicas JSONB a captacion_leads
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--
-- El scraper ahora extrae las "Características básicas", "Edificio" y
-- "Certificado energético" de la página de detalle de cada anuncio y las
-- guarda en este campo como JSON. Ejemplo:
--
-- {
--   "Características básicas": [
--     "110 m² construidos",
--     "4 habitaciones",
--     "2 baños",
--     "Segunda mano/buen estado",
--     "Orientación este",
--     "Calefacción central"
--   ],
--   "Edificio": [
--     "Planta 2ª exterior",
--     "Con ascensor"
--   ],
--   "Certificado energético": ["En trámite"]
-- }
--

ALTER TABLE captacion_leads
  ADD COLUMN IF NOT EXISTS caracteristicas JSONB;
