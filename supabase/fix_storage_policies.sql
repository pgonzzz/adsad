-- ============================================================
-- Fix: políticas de storage para el bucket "propiedades"
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
--
-- Sin estas políticas, subir fotos desde el CRM falla con
-- "new row violates row-level security policy".
--

-- Asegurar que el bucket existe y es público (las URLs son accesibles)
INSERT INTO storage.buckets (id, name, public)
VALUES ('propiedades', 'propiedades', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Permitir a usuarios autenticados subir archivos
CREATE POLICY "auth_upload_propiedades"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'propiedades');

-- Permitir lectura pública (las fotos se muestran en la web)
CREATE POLICY "public_read_propiedades"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'propiedades');

-- Permitir a usuarios autenticados actualizar sus archivos
CREATE POLICY "auth_update_propiedades"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'propiedades');

-- Permitir a usuarios autenticados borrar archivos
CREATE POLICY "auth_delete_propiedades"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'propiedades');
