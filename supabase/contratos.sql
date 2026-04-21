-- ─────────────────────────────────────────────────────────────────────────────
-- Módulo CONTRATOS
--
-- Dos entidades:
--   1) Plantillas (.docx con placeholders {{campo}}). El usuario las sube una
--      vez y el CRM detecta automáticamente los campos.
--   2) Contratos firmados (PDF, DOCX, etc. ya rellenos y firmados). Se asocian
--      opcionalmente a un inversor o a un proveedor para que aparezcan en sus
--      respectivas fichas.
--
-- El acceso se controla a nivel de API (backend) comprobando el email del
-- usuario contra CONTRATOS_ALLOWED_EMAILS. No ponemos RLS estricta porque el
-- backend ya usa la service key.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Bucket de Storage para los archivos. Privado.
insert into storage.buckets (id, name, public)
values ('contratos', 'contratos', false)
on conflict (id) do nothing;

-- 2) Plantillas
create table if not exists contratos_plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  archivo_path text not null,   -- 'plantillas/<uuid>.docx' dentro del bucket
  campos jsonb not null default '[]'::jsonb, -- array con los placeholders detectados
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contratos_plantillas_created_idx
  on contratos_plantillas(created_at desc);

-- 3) Contratos firmados
create table if not exists contratos_firmados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  archivo_path text not null,           -- 'firmados/<uuid>.<ext>'
  archivo_nombre_original text,         -- para preservar el nombre al descargar
  archivo_mime text,                    -- 'application/pdf', etc.
  plantilla_id uuid references contratos_plantillas(id) on delete set null,
  valores jsonb default '{}'::jsonb,    -- valores del formulario usados al generar (si aplica)
  inversor_id uuid references inversores(id) on delete set null,
  proveedor_id uuid references proveedores(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contratos_firmados_inversor_idx
  on contratos_firmados(inversor_id) where inversor_id is not null;

create index if not exists contratos_firmados_proveedor_idx
  on contratos_firmados(proveedor_id) where proveedor_id is not null;

create index if not exists contratos_firmados_created_idx
  on contratos_firmados(created_at desc);
