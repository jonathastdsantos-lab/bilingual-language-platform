-- ============================================================================
-- MIGRATION 0011 (DRIZZLE): GUIAS TISS / FATURAMENTO DE CONVÊNIOS ODONTOLÓGICOS (GTO)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tiss_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  insurance_id UUID REFERENCES public.dental_insurances(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  guide_number TEXT NOT NULL,
  auth_code TEXT,
  guide_type TEXT NOT NULL DEFAULT 'treatment' CHECK (guide_type IN ('treatment', 'initial_exam', 'urgency')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'authorized', 'billed', 'paid', 'glosed', 'cancelled')
  ),
  card_number TEXT NOT NULL,
  card_expiration DATE,
  cns_number TEXT,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  billed_date DATE,
  paid_date DATE,
  total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  glosed_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (glosed_amount >= 0),
  notes TEXT,
  created_by UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tiss_guide_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  guide_id UUID NOT NULL REFERENCES public.tiss_guides(id) ON DELETE CASCADE,
  tuss_code TEXT NOT NULL,
  description TEXT NOT NULL,
  tooth_number INT,
  tooth_surface TEXT,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
  glosed BOOLEAN NOT NULL DEFAULT FALSE,
  glosa_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tiss_guides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiss_guide_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiss_guides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiss_guide_items TO authenticated;

