-- ============================================================
-- Captación: plantillas reutilizables de mensajes de WhatsApp
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--
-- Permite que cada usuario guarde plantillas de mensajes con
-- variables ({{nombre}}, {{precio}}, {{poblacion}}, {{tipo}}, ...)
-- y las cargue en un clic al crear o editar una campaña.
--
-- Una plantilla es del tipo 'inicial' (primer contacto) o
-- 'followup' (recordatorio). El campo `nombre` es un identificador
-- legible para el usuario (ej. "Primer contacto formal",
-- "Follow-up insistente").
--

CREATE TABLE IF NOT EXISTS captacion_plantillas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  texto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('inicial', 'followup')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plantillas_user_tipo
  ON captacion_plantillas(user_id, tipo);

-- Trigger para mantener updated_at al modificar una plantilla
CREATE OR REPLACE FUNCTION touch_plantilla_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plantilla_updated_at ON captacion_plantillas;
CREATE TRIGGER trg_plantilla_updated_at
  BEFORE UPDATE ON captacion_plantillas
  FOR EACH ROW
  EXECUTE FUNCTION touch_plantilla_updated_at();
