-- ============================================================
-- Añadir campo estado a proveedores (potencial | activo)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE proveedores
  ADD COLUMN IF NOT EXISTS estado TEXT NOT NULL DEFAULT 'potencial'
  CHECK (estado IN ('potencial', 'activo'));

CREATE INDEX IF NOT EXISTS idx_proveedores_estado ON proveedores(estado);
