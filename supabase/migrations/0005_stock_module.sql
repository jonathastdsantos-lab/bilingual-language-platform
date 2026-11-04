-- =============================================================================
-- SondaPro — Migration 0005: Controle de Estoque, Insumos Odontológicos, Lotes,
-- Validade Sanitária (ANVISA) e Kardex de Movimentações Multi-Tenant
-- =============================================================================

-- 1. Atualização da função has_clinic_permission para incluir stock.read e stock.write
CREATE OR REPLACE FUNCTION public.has_clinic_permission(
  _user_id UUID,
  _clinic_id UUID,
  _permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.clinic_role;
  v_member_id UUID;
  v_override BOOLEAN;
BEGIN
  IF _user_id IS NULL OR _clinic_id IS NULL OR _permission IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT id, role
    INTO v_member_id, v_role
    FROM public.clinic_members
   WHERE user_id = _user_id
     AND clinic_id = _clinic_id
   LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_role = 'owner' THEN
    RETURN TRUE;
  END IF;

  SELECT granted
    INTO v_override
    FROM public.clinic_member_permissions
   WHERE clinic_id = _clinic_id
     AND member_id = v_member_id
     AND permission = _permission
   LIMIT 1;

  IF v_override IS NOT NULL THEN
    RETURN v_override;
  END IF;

  CASE _permission
    WHEN 'dashboard.view' THEN
      RETURN TRUE;
    WHEN 'financial.view' THEN
      RETURN v_role IN ('admin', 'dentist', 'finance');
    WHEN 'financial.write' THEN
      RETURN v_role IN ('admin', 'finance', 'receptionist');
    WHEN 'patients.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist', 'assistant', 'finance');
    WHEN 'patients.write' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist');
    WHEN 'records.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'assistant');
    WHEN 'records.write' THEN
      RETURN v_role IN ('admin', 'dentist');
    WHEN 'appointments.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist', 'assistant', 'finance');
    WHEN 'appointments.write' THEN
      RETURN v_role IN ('admin', 'dentist', 'receptionist');
    WHEN 'stock.read' THEN
      RETURN v_role IN ('admin', 'dentist', 'assistant', 'stock', 'receptionist');
    WHEN 'stock.write' THEN
      RETURN v_role IN ('admin', 'stock', 'assistant');
    WHEN 'team.manage' THEN
      RETURN v_role IN ('admin');
    WHEN 'settings.manage' THEN
      RETURN v_role IN ('admin');
    WHEN 'units.manage' THEN
      RETURN v_role IN ('admin');
    WHEN 'audit.view' THEN
      RETURN v_role IN ('admin');
    ELSE
      RETURN FALSE;
  END CASE;
END;
$$;

-- 2. Enum para tipos de movimentação de estoque (Kardex)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stock_movement_type') THEN
    CREATE TYPE public.stock_movement_type AS ENUM (
      'in',
      'out',
      'adjustment',
      'expired_loss'
    );
  END IF;
END $$;

-- 3. Tabela de Catálogo de Materiais e Insumos Odontológicos (stock_items)
CREATE TABLE IF NOT EXISTS public.stock_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
  category TEXT NOT NULL,
  sku TEXT,
  unit_measure TEXT NOT NULL DEFAULT 'un',
  current_quantity NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (current_quantity >= 0),
  min_quantity NUMERIC(12, 2) NOT NULL DEFAULT 5 CHECK (min_quantity >= 0),
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  supplier TEXT,
  batch_number TEXT,
  expiration_date DATE,
  storage_location TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_items_clinic_name
  ON public.stock_items(clinic_id, name);

CREATE INDEX IF NOT EXISTS idx_stock_items_clinic_expiration
  ON public.stock_items(clinic_id, expiration_date);

-- 4. Tabela de Kardex / Movimentações de Estoque (stock_movements — somente-acrescentar)
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  unit_id UUID REFERENCES public.clinic_units(id) ON DELETE SET NULL,
  movement_type public.stock_movement_type NOT NULL,
  quantity NUMERIC(12, 2) NOT NULL CHECK (quantity > 0),
  previous_quantity NUMERIC(12, 2) NOT NULL CHECK (previous_quantity >= 0),
  resulting_quantity NUMERIC(12, 2) NOT NULL CHECK (resulting_quantity >= 0),
  unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  batch_number TEXT,
  expiration_date DATE,
  reason TEXT NOT NULL CHECK (char_length(trim(reason)) >= 2),
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_clinic_created
  ON public.stock_movements(clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_movements_item
  ON public.stock_movements(item_id, created_at DESC);

-- 5. Habilitação de Row Level Security (RLS)
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para stock_items
DROP POLICY IF EXISTS "stock_items_select_policy" ON public.stock_items;
CREATE POLICY "stock_items_select_policy"
  ON public.stock_items
  FOR SELECT
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.read'));

DROP POLICY IF EXISTS "stock_items_insert_policy" ON public.stock_items;
CREATE POLICY "stock_items_insert_policy"
  ON public.stock_items
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'));

DROP POLICY IF EXISTS "stock_items_update_policy" ON public.stock_items;
CREATE POLICY "stock_items_update_policy"
  ON public.stock_items
  FOR UPDATE
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'))
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'));

DROP POLICY IF EXISTS "stock_items_delete_policy" ON public.stock_items;
CREATE POLICY "stock_items_delete_policy"
  ON public.stock_items
  FOR DELETE
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'));

-- Políticas RLS para stock_movements (Kardex imutável: SELECT e INSERT apenas)
DROP POLICY IF EXISTS "stock_movements_select_policy" ON public.stock_movements;
CREATE POLICY "stock_movements_select_policy"
  ON public.stock_movements
  FOR SELECT
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.read'));

DROP POLICY IF EXISTS "stock_movements_insert_policy" ON public.stock_movements;
CREATE POLICY "stock_movements_insert_policy"
  ON public.stock_movements
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'stock.write'));

-- 6. Triggers de Auditoria Automática
DROP TRIGGER IF EXISTS trg_audit_stock_items ON public.stock_items;
CREATE TRIGGER trg_audit_stock_items
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_items
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

DROP TRIGGER IF EXISTS trg_audit_stock_movements ON public.stock_movements;
CREATE TRIGGER trg_audit_stock_movements
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

