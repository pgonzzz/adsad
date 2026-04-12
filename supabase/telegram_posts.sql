-- ============================================================
-- Telegram: publicaciones programadas desde el CRM
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS telegram_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  propiedad_id UUID REFERENCES propiedades(id) ON DELETE SET NULL,
  -- Contenido
  texto TEXT NOT NULL,
  fotos TEXT[] DEFAULT ARRAY[]::TEXT[],       -- URLs de fotos seleccionadas
  -- Programación
  estado TEXT NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'programado', 'publicado', 'error')),
  programado_para TIMESTAMPTZ,               -- null = publicar ya
  publicado_at TIMESTAMPTZ,
  telegram_message_id TEXT,                   -- ID del mensaje en Telegram
  error_msg TEXT,
  -- Config
  chat_id TEXT,                               -- override por post (normalmente se usa el global)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_posts_estado
  ON telegram_posts (estado, programado_para)
  WHERE estado = 'programado';

CREATE INDEX IF NOT EXISTS idx_telegram_posts_propiedad
  ON telegram_posts (propiedad_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION touch_telegram_post_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_telegram_post_updated ON telegram_posts;
CREATE TRIGGER trg_telegram_post_updated
  BEFORE UPDATE ON telegram_posts
  FOR EACH ROW EXECUTE FUNCTION touch_telegram_post_updated_at();
