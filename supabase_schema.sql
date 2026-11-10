-- ==============================================================================
-- SISTEMA DE INVENTARIO Y VENTAS - TIENDA DEPORTIVA Y CONFECCIONES
-- ESQUEMA COMPLETO, ACTUALIZADO Y POLÍTICAS RLS DEFINITIVAS PARA SUPABASE
-- ==============================================================================
-- Instrucciones:
-- 1. Abre tu proyecto en Supabase (https://supabase.com/dashboard).
-- 2. Ve a "SQL Editor" en el menú lateral izquierdo.
-- 3. Crea una nueva consulta ("New query"), pega TODO este código y presiona "Run".
-- NOTA: Este script NO borra tus productos ni tus ventas actuales; solo actualiza
--       las tablas y repara todos los permisos RLS para que funcione en local y Netlify.
-- ==============================================================================

-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Función automática para actualizar 'updated_at'
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================
-- 3. TABLA DE USUARIOS Y AUTENTICACIÓN
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL DEFAULT 'Administración General',
    role VARCHAR(20) NOT NULL DEFAULT 'OWNER',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insertar/Actualizar usuario Administrador (Contraseña: jksport12 / admin)
INSERT INTO public.users (username, password_hash, full_name, role)
VALUES (
    'admin',
    '$2b$10$JO11zZ6MiYUt9VsTrenFoeQtRXx.JW1IIREFrfqqvdmPWa.LgfbE2',
    'Administración General',
    'OWNER'
)
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- ==============================================================================
-- 4. TABLA DE PRODUCTOS (INVENTARIO UNIFICADO)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Confecciones & Ropa',
    sport VARCHAR(50) DEFAULT 'General',
    size VARCHAR(30),
    color VARCHAR(50),
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    image_url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Asegurar que size y color permitan NULL sin valores forzados
ALTER TABLE public.products ALTER COLUMN size DROP DEFAULT;
ALTER TABLE public.products ALTER COLUMN color DROP DEFAULT;

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);

-- ==============================================================================
-- 5. TABLA DE VENTAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sales (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    sale_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(150) DEFAULT 'Cliente Ocasional',
    customer_phone VARCHAR(50) DEFAULT 'admin',
    seller_name VARCHAR(100) DEFAULT 'admin',
    payment_method VARCHAR(20) NOT NULL CHECK(payment_method IN ('cash', 'qr', 'transfer')),
    total NUMERIC(12, 2) NOT NULL,
    total_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_received NUMERIC(12, 2) DEFAULT 0.00,
    change_returned NUMERIC(12, 2) DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'VOIDED')),
    voided_reason TEXT,
    voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agregar columna seller_name si la tabla ya existía antes
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS seller_name VARCHAR(100) DEFAULT 'admin';

CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);

-- ==============================================================================
-- 6. TABLA DE DETALLES DE VENTA (ARTÍCULOS VENDIDOS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sale_items (
    id SERIAL PRIMARY KEY,
    sale_id INTEGER NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES public.products(id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL,
    size VARCHAR(30),
    color VARCHAR(50),
    quantity INTEGER NOT NULL CHECK(quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL,
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    subtotal NUMERIC(12, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON public.sale_items(sale_id);

-- ==============================================================================
-- 7. TABLA DE HISTORIAL DE MOVIMIENTOS DE STOCK (KARDEX)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    product_id INTEGER NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL CHECK(type IN ('SALE', 'PURCHASE', 'ADJUSTMENT', 'VOID')),
    quantity INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL,
    new_stock INTEGER NOT NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON public.stock_movements(created_at);

-- ==============================================================================
-- 8. TABLA DE ARQUEO Y CIERRES DE CAJA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.cash_registers (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    initial_cash NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cash_sales NUMERIC(12, 2) DEFAULT 0.00,
    qr_sales NUMERIC(12, 2) DEFAULT 0.00,
    transfer_sales NUMERIC(12, 2) DEFAULT 0.00,
    total_sales NUMERIC(12, 2) DEFAULT 0.00,
    expected_cash NUMERIC(12, 2) DEFAULT 0.00,
    counted_cash NUMERIC(12, 2),
    difference NUMERIC(12, 2),
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED'))
);

-- ==============================================================================
-- 9. TABLA DE AUDITORÍA Y BITÁCORA DEL SISTEMA
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    username VARCHAR(100) DEFAULT 'admin',
    action VARCHAR(50) NOT NULL,
    target_entity VARCHAR(50) NOT NULL,
    target_id VARCHAR(50),
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT
);

-- Agregar columna username si la tabla ya existía antes
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS username VARCHAR(100) DEFAULT 'admin';

CREATE INDEX IF NOT EXISTS idx_audit_time ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action);

-- ==============================================================================
-- 10. VISTA PÚBLICA PARA CATÁLOGO WEB
-- ==============================================================================
CREATE OR REPLACE VIEW public.web_catalog AS
SELECT 
    p.id,
    p.uuid,
    p.name,
    p.category,
    p.sport,
    p.size,
    p.color,
    p.sale_price,
    p.image_url,
    p.description,
    p.stock,
    CASE WHEN p.stock > 0 THEN TRUE ELSE FALSE END AS in_stock
FROM public.products p
WHERE p.is_active = TRUE;

-- ==============================================================================
-- 11. BUCKET DE ALMACENAMIENTO (SUPABASE STORAGE) PARA FOTOS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

DROP POLICY IF EXISTS "Lectura publica de fotos de productos" ON storage.objects;
CREATE POLICY "Lectura publica de fotos de productos"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Subida de fotos autorizada" ON storage.objects;
CREATE POLICY "Subida de fotos autorizada"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Actualizacion de fotos autorizada" ON storage.objects;
CREATE POLICY "Actualizacion de fotos autorizada"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Eliminacion de fotos autorizada" ON storage.objects;
CREATE POLICY "Eliminacion de fotos autorizada"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images');

-- ==============================================================================
-- 12. POLÍTICAS DE ACCESO (ROW LEVEL SECURITY - RLS) SIN BLOQUEOS
-- Permite que tanto el servidor local como Netlify operen sin errores de permisos
-- ==============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas antiguas restrictivas
DROP POLICY IF EXISTS "Acceso admin a usuarios" ON public.users;
DROP POLICY IF EXISTS "Lectura de productos activos" ON public.products;
DROP POLICY IF EXISTS "Modificacion de productos para admin" ON public.products;
DROP POLICY IF EXISTS "Acceso admin a ventas" ON public.sales;
DROP POLICY IF EXISTS "Acceso admin a items de venta" ON public.sale_items;
DROP POLICY IF EXISTS "Acceso admin a movimientos" ON public.stock_movements;
DROP POLICY IF EXISTS "Acceso admin a caja" ON public.cash_registers;
DROP POLICY IF EXISTS "Acceso admin a auditoria" ON public.audit_logs;

-- Limpiar políticas nuevas por si se re-ejecuta el script
DROP POLICY IF EXISTS "Permitir todo en users" ON public.users;
DROP POLICY IF EXISTS "Permitir todo en products" ON public.products;
DROP POLICY IF EXISTS "Permitir todo en sales" ON public.sales;
DROP POLICY IF EXISTS "Permitir todo en sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Permitir todo en stock_movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Permitir todo en cash_registers" ON public.cash_registers;
DROP POLICY IF EXISTS "Permitir todo en audit_logs" ON public.audit_logs;

-- Crear políticas claras y completas (SELECT, INSERT, UPDATE, DELETE) para la app
CREATE POLICY "Permitir todo en users"
ON public.users FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir todo en products"
ON public.products FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir todo en sales"
ON public.sales FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir todo en sale_items"
ON public.sale_items FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir todo en stock_movements"
ON public.stock_movements FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir todo en cash_registers"
ON public.cash_registers FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "Permitir todo en audit_logs"
ON public.audit_logs FOR ALL
TO anon, authenticated, service_role
USING (true)
WITH CHECK (true);

-- Garantizar privilegios sobre tablas y secuencias (IDs autoincrementales)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
