-- ============================================================
-- Audit log + dedupe enriquecimiento en captación
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- ─── 1. Tabla activity_log ────────────────────────────────────────
-- Registra cada cambio en el CRM: quién, qué entidad, qué acción,
-- qué campos cambiaron. Consultable desde el frontend.
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  accion TEXT NOT NULL,          -- 'create' | 'update' | 'delete'
  entidad TEXT NOT NULL,         -- 'inversores' | 'propiedades' | 'captacion_campanas' ...
  entidad_id TEXT,               -- UUID o ID de la entidad afectada
  resumen TEXT,                  -- Descripción legible ej. "Creó propiedad Piso en Valencia"
  cambios JSONB,                 -- { campo: { antes, despues } } o null para creates/deletes
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created
  ON activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_entidad
  ON activity_log (entidad, entidad_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_user
  ON activity_log (user_id);

-- ─── 2. Dedupe en leads: marcar duplicados cross-campaña ──────────
-- duplicado_de: apunta al lead original (la primera vez que vimos ese teléfono)
-- proveedor_id: si el teléfono coincide con un proveedor existente
ALTER TABLE captacion_leads
  ADD COLUMN IF NOT EXISTS duplicado_de UUID REFERENCES captacion_leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_telefono
  ON captacion_leads (telefono)
  WHERE telefono IS NOT NULL AND telefono != '';

CREATE INDEX IF NOT EXISTS idx_leads_duplicado
  ON captacion_leads (duplicado_de)
  WHERE duplicado_de IS NOT NULL;
