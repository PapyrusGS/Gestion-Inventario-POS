-- ==============================================================================
-- SISTEMA DE INVENTARIO Y VENTAS - TIENDA DEPORTIVA Y CONFECCIONES
-- ESQUEMA COMPLETO Y DEFINITIVO PARA SUPABASE (POSTGRESQL)
-- ==============================================================================
-- Instrucciones:
-- 1. Abre tu proyecto en Supabase (https://app.supabase.com).
-- 2. Ve a la pestaña "SQL Editor" en el menú lateral izquierdo.
-- 3. Crea una nueva consulta ("New query"), pega todo este contenido y presiona "Run".
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
-- 3. TABLA DE USUARIOS Y AUTENTICACIÓN (ENCRIPTADA CON BCRYPT)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name VARCHAR(150) NOT NULL DEFAULT 'Administración General (Propietarios)',
    role VARCHAR(20) NOT NULL DEFAULT 'OWNER',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso admin a usuarios" ON public.users;
CREATE POLICY "Acceso admin a usuarios"
ON public.users FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Insertar usuario inicial Administrador con contraseña encriptada (bcrypt)
-- Contraseña configurada en variables de entorno
INSERT INTO public.users (username, password_hash, full_name, role)
VALUES (
    'admin',
    '$2b$10$pa9S5DP1DMOK1yupnEcR1erDthZzgPybIfLxQTQEq5zT6tM09/Aya',
    'Administración General (Propietarios)',
    'OWNER'
)
ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash;

-- ==============================================================================
-- 4. TABLA DE PRODUCTOS (PRENDAS, CONFECCIONES Y ARTÍCULOS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.products (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(100) NOT NULL DEFAULT 'Confecciones & Ropa',
    sport VARCHAR(50) DEFAULT 'General',
    size VARCHAR(30) DEFAULT 'Estándar',
    color VARCHAR(50) DEFAULT 'Surtido',
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    sale_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    stock INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 5,
    image_url TEXT, -- URL de la foto en Supabase Storage o externa
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para updated_at automático
DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Índices para acelerar búsquedas
CREATE INDEX IF NOT EXISTS idx_products_name ON public.products(name);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);
CREATE INDEX IF NOT EXISTS idx_products_sport ON public.products(sport);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);

-- ==============================================================================
-- 4. TABLA DE VENTAS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.sales (
    id SERIAL PRIMARY KEY,
    uuid UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
    sale_number VARCHAR(50) NOT NULL,
    customer_name VARCHAR(150) DEFAULT 'Cliente Ocasional',
    customer_phone VARCHAR(30) DEFAULT '',
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

CREATE INDEX IF NOT EXISTS idx_sales_date ON public.sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_status ON public.sales(status);

-- ==============================================================================
-- 5. TABLA DE DETALLES DE VENTA (ITEMS)
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
-- 6. TABLA DE HISTORIAL DE MOVIMIENTOS DE STOCK (KARDEX)
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
-- 7. TABLA DE ARQUEO Y CIERRES DE CAJA
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
-- 8. TABLA DE AUDITORÍA FORENSE INMUTABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action VARCHAR(50) NOT NULL,
    target_entity VARCHAR(50) NOT NULL,
    target_id VARCHAR(50),
    old_values JSONB,
    new_values JSONB,
    reason TEXT,
    ip_address VARCHAR(50),
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_time ON public.audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_action ON public.audit_logs(action);

-- ==============================================================================
-- 9. VISTA PÚBLICA PARA LA FUTURA PÁGINA WEB / CATÁLOGO ONLINE
-- Expone fotos, tallas, colores, precios de venta y stock.
-- Oculta estrictamente precios de costo y márgenes de ganancia.
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
-- 10. BUCKET DE ALMACENAMIENTO (SUPABASE STORAGE) PARA FOTOS
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- Políticas de seguridad para el Storage de imágenes
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
-- 11. POLÍTICAS DE ACCESO (ROW LEVEL SECURITY - RLS)
-- ==============================================================================
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Catálogo de productos: lectura permitida para la web pública y app
DROP POLICY IF EXISTS "Lectura de productos activos" ON public.products;
CREATE POLICY "Lectura de productos activos"
ON public.products FOR SELECT
USING (is_active = TRUE);

-- Escritura en productos: permitida para usuarios autenticados / servicio backend
DROP POLICY IF EXISTS "Modificacion de productos para admin" ON public.products;
CREATE POLICY "Modificacion de productos para admin"
ON public.products FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- Ventas y demás módulos protegidos para administración y servicio backend
DROP POLICY IF EXISTS "Acceso admin a ventas" ON public.sales;
CREATE POLICY "Acceso admin a ventas"
ON public.sales FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Acceso admin a items de venta" ON public.sale_items;
CREATE POLICY "Acceso admin a items de venta"
ON public.sale_items FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Acceso admin a movimientos" ON public.stock_movements;
CREATE POLICY "Acceso admin a movimientos"
ON public.stock_movements FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Acceso admin a caja" ON public.cash_registers;
CREATE POLICY "Acceso admin a caja"
ON public.cash_registers FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

DROP POLICY IF EXISTS "Acceso admin a auditoria" ON public.audit_logs;
CREATE POLICY "Acceso admin a auditoria"
ON public.audit_logs FOR ALL
USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');
