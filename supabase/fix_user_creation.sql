-- ============================================================
-- Fix: "Database error saving new user" al invitar usuarios
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--
-- Causa: el trigger AFTER INSERT ON auth.users llamaba a
-- create_agent_key_on_signup() sin SET search_path y sin
-- cualificar el esquema. El rol supabase_auth_admin, que es
-- quien dispara el trigger al invitar/crear un usuario, corre
-- con un search_path que no incluye public, por lo que la
-- inserción fallaba y abortaba toda la transacción de creación
-- del usuario.
--
-- Fix:
--   1. SECURITY DEFINER + SET search_path = public, pg_temp.
--   2. Referencia cualificada: public.captacion_agent_keys.
--   3. EXCEPTION WHEN OTHERS: si la inserción aún fallara, se
--      registra un WARNING pero no se bloquea el alta del user.
--   4. GRANTs explícitos a supabase_auth_admin por defensa.
--

CREATE OR REPLACE FUNCTION public.create_agent_key_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.captacion_agent_keys (user_id, nombre)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'create_agent_key_on_signup falló para %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT, SELECT ON public.captacion_agent_keys TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created_captacion ON auth.users;
CREATE TRIGGER on_auth_user_created_captacion
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.create_agent_key_on_signup();
