-- ============================================================
-- Captación: soporte multi-usuario para WhatsApp
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--
-- Permite que varios usuarios del CRM conecten su propio WhatsApp
-- de forma simultánea. Cada usuario tiene una clave de agente única
-- (agent_key) que configura en su propio agente local. El backend
-- enruta cada tarea al agente del usuario correcto según esa clave.
--
-- Cambios:
-- 1. Nueva tabla captacion_agent_keys: user_id -> agent_key (UUID).
-- 2. captacion_campanas.user_id: dueño de la campaña.
-- 3. captacion_tareas.user_id: hereda de la campaña.
-- 4. Trigger que auto-crea una agent_key al crearse un user nuevo.
-- 5. Se crea una agent_key para cada usuario existente.
-- 6. Las campañas/tareas existentes se asignan al primer usuario
--    (el más antiguo por created_at en auth.users).
--

-- ─── 1. Tabla de claves de agente por usuario ───────────────────
CREATE TABLE IF NOT EXISTS captacion_agent_keys (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_key TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  nombre TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_keys_key ON captacion_agent_keys(agent_key);

-- ─── 2. Añadir user_id a captacion_campanas y captacion_tareas ──
ALTER TABLE captacion_campanas
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE captacion_tareas
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_campanas_user_id ON captacion_campanas(user_id);
CREATE INDEX IF NOT EXISTS idx_tareas_user_id_estado
  ON captacion_tareas(user_id, estado)
  WHERE estado IN ('pendiente', 'en_proceso');

-- ─── 3. Crear agent_key para usuarios existentes ────────────────
INSERT INTO captacion_agent_keys (user_id, nombre)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email)
FROM auth.users u
ON CONFLICT (user_id) DO NOTHING;

-- ─── 4. Poblar user_id en datos existentes (al primer usuario) ──
-- Asume que el usuario más antiguo (por created_at) es el dueño
-- original de todos los datos existentes. Si hay múltiples usuarios
-- y quieres repartir datos manualmente, haz UPDATEs específicos
-- después de ejecutar esta migración.

UPDATE captacion_campanas
SET user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
WHERE user_id IS NULL;

UPDATE captacion_tareas
SET user_id = (SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1)
WHERE user_id IS NULL;

-- ─── 5. Trigger que auto-crea agent_key al crear un usuario nuevo ─
CREATE OR REPLACE FUNCTION create_agent_key_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO captacion_agent_keys (user_id, nombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_captacion ON auth.users;
CREATE TRIGGER on_auth_user_created_captacion
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_agent_key_on_signup();
