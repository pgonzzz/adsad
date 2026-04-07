-- ============================================================
-- CRM Pisalia - Schema Supabase (PostgreSQL)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Inversores
CREATE TABLE inversores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  empresa TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Peticiones de inversores (qué están buscando)
CREATE TABLE peticiones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  inversor_id UUID REFERENCES inversores(id) ON DELETE CASCADE,
  tipos_propiedad TEXT[],         -- ej: ['piso', 'local']
  zona TEXT,
  precio_min NUMERIC,
  precio_max NUMERIC,
  rentabilidad_min NUMERIC,       -- porcentaje bruto mínimo
  necesita_financiacion BOOLEAN DEFAULT FALSE,
  estado TEXT DEFAULT 'activa'    -- activa | pausada | cerrada
    CHECK (estado IN ('activa', 'pausada', 'cerrada')),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Proveedores (inmobiliarias y propietarios)
CREATE TABLE proveedores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('inmobiliaria', 'propietario')),
  nombre TEXT NOT NULL,
  email TEXT,
  telefono TEXT,
  empresa TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Propiedades (activos disponibles)
CREATE TABLE propiedades (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  proveedor_id UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL
    CHECK (tipo IN ('piso', 'local', 'nave', 'edificio', 'solar', 'otro')),
  zona TEXT,
  precio NUMERIC,
  rentabilidad_bruta NUMERIC,
  rentabilidad_neta NUMERIC,
  acepta_financiacion BOOLEAN DEFAULT FALSE,
  descripcion TEXT,
  estado TEXT DEFAULT 'disponible'
    CHECK (estado IN ('disponible', 'en_negociacion', 'vendida')),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Matches (cruces petición ↔ propiedad)
CREATE TABLE matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  peticion_id UUID REFERENCES peticiones(id) ON DELETE CASCADE,
  propiedad_id UUID REFERENCES propiedades(id) ON DELETE CASCADE,
  score NUMERIC DEFAULT 0,        -- 0-100
  estado TEXT DEFAULT 'sugerido'
    CHECK (estado IN ('sugerido', 'enviado', 'negociando', 'cerrado', 'descartado')),
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (peticion_id, propiedad_id)
);

-- Operaciones (gestión de la compra)
CREATE TABLE operaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID REFERENCES matches(id) ON DELETE CASCADE,
  estado TEXT DEFAULT 'en_curso'
    CHECK (estado IN ('en_curso', 'firmada', 'caida')),
  precio_final NUMERIC,
  comision NUMERIC,
  fecha_firma DATE,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices útiles
CREATE INDEX idx_peticiones_inversor ON peticiones(inversor_id);
CREATE INDEX idx_propiedades_proveedor ON propiedades(proveedor_id);
CREATE INDEX idx_matches_peticion ON matches(peticion_id);
CREATE INDEX idx_matches_propiedad ON matches(propiedad_id);
CREATE INDEX idx_matches_estado ON matches(estado);
CREATE INDEX idx_operaciones_match ON operaciones(match_id);
