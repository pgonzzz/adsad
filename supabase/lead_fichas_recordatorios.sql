-- ============================================================
-- Ficha de leads: recordatorios + notas (timeline)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- ─── 1. Comentarios/notas (timeline) en leads ────────────────────
-- Mismo patrón que inversores y propiedades
ALTER TABLE captacion_leads
  ADD COLUMN IF NOT EXISTS comentarios JSONB DEFAULT '[]'::JSONB;

-- ─── 2. Tabla de recordatorios ───────────────────────────────────
-- Puede asociarse a un lead, propiedad, inversor o cualquier entidad.
-- El scheduler del backend revisa cada minuto y marca como "disparado".
CREATE TABLE IF NOT EXISTS recordatorios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Entidad asociada (polimórfica)
  entidad TEXT NOT NULL,          -- 'lead' | 'propiedad' | 'inversor' | 'proveedor'
  entidad_id TEXT NOT NULL,       -- UUID de la entidad
  -- Contenido
  titulo TEXT NOT NULL,
  descripcion TEXT,
  -- Programación
  fecha_hora TIMESTAMPTZ NOT NULL,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'disparado', 'completado', 'cancelado')),
  disparado_at TIMESTAMPTZ,
  completado_at TIMESTAMPTZ,
  -- Meta
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_pendientes
  ON recordatorios (fecha_hora)
  WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_recordatorios_user
  ON recordatorios (user_id, estado);

CREATE INDEX IF NOT EXISTS idx_recordatorios_entidad
  ON recordatorios (entidad, entidad_id);

-- ─── 3. Tabla de notificaciones in-app ───────────────────────────
-- Cuando un recordatorio se dispara, se crea una notificación.
-- El frontend la muestra en la campanita de la topbar.
CREATE TABLE IF NOT EXISTS notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensaje TEXT,
  url TEXT,                       -- link al que navegar al hacer clic
  leida BOOLEAN DEFAULT FALSE,
  recordatorio_id UUID REFERENCES recordatorios(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_user_no_leida
  ON notificaciones (user_id, created_at DESC)
  WHERE leida = FALSE;
